import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../../core/GameConfig";
import { PARTICLE_STRIDE } from "./ParticleBuffer";
import type { ParticleBuffer } from "./ParticleBuffer";
import type { RopeCollider } from "./RopeCollider";
import type { SelfCollision } from "./SelfCollision";

const ANCHOR = 0;
/**
 * Какую долю звена частица может пройти за подшаг: защита от туннелирования (Мюллер,
 * 15-selfCollision) и от выворачивания цепочки наизнанку.
 *
 * У Мюллера предел берётся от толщины ткани, но здесь это давало 0.02 м за подшаг, то есть
 * 12 м/с при 60 кадрах. Верёвка не успевала за брошенным кубом, жёсткое звено тормозило его
 * до своей скорости, и бросок упирался в этот предел вместо длины верёвки. От звена предел
 * выходит на порядок выше и в игровых скоростях уже не участвует.
 *
 * Пол это не задевает: `GroundCollider` проверяет полупространство, а не тонкую плёнку,
 * и частицу ниже поверхности ловит с любой скоростью.
 */
const MAX_TRAVEL_PER_STEP = 0.5;

/**
 * XPBD-решатель верёвки по схеме Ten Minute Physics (14-cloth, 15-selfCollision):
 * много подшагов, в каждом — предсказание позиций, проекция ограничений, скорость из смещения.
 *
 * Частица 0 — якорь на руке (inverseMass = 0, позицию задаёт владелец).
 * Последняя — прокси тела Havok: интегрируется без гравитации, её даёт телу сам Havok.
 */
export class RopeSolver {
  private readonly particles: ParticleBuffer;
  private readonly colliders: readonly RopeCollider[];
  private readonly selfCollision: SelfCollision;
  private readonly proxy: number;
  /** Длина звена при полностью размотанной верёвке: ниже неё укорачивает натяжение. */
  private readonly fullSegment: number;
  private readonly anchor = new Vector3();
  /** Квадрат самой большой скорости частицы в прошлом шаге — по нему верёвка засыпает. */
  private fastestSpeedSquared = 0;

  public constructor(
    particles: ParticleBuffer,
    colliders: readonly RopeCollider[],
    selfCollision: SelfCollision,
  ) {
    this.particles = particles;
    this.colliders = colliders;
    this.selfCollision = selfCollision;
    this.proxy = particles.count - 1;
    this.fullSegment = GameConfig.rope.length / this.proxy;
  }

  /** Насколько быстро двигалась верёвка в прошлом шаге: 0 — стоит на месте. */
  public get motion(): number {
    return this.fastestSpeedSquared;
  }

  /** `extent` — рабочая длина верёвки, м: натянутая верёвка короче размотанной. */
  public simulate(frameDt: number, anchorFrom: Vector3, anchorTo: Vector3, extent: number): void {
    const substeps = GameConfig.rope.substeps;
    const dt = frameDt / substeps;

    for (let c = 0; c < this.colliders.length; c++) {
      this.colliders[c]!.prepare();
    }

    // Кандидаты на самопересечение — раз в кадр, с запасом на путь частицы за этот кадр.
    this.selfCollision.prepare(this.particles, this.reachPerFrame(frameDt, dt));

    for (let step = 0; step < substeps; step++) {
      // Якорь идёт за рукой плавно внутри кадра, иначе верёвку дёргает раз в кадр.
      Vector3.LerpToRef(anchorFrom, anchorTo, (step + 1) / substeps, this.anchor);
      this.particles.write(this.particles.position, ANCHOR, this.anchor);

      this.integrate(dt);
      this.solveConstraints(dt, Math.min(extent / this.proxy, this.fullSegment));
      this.solveCollisions();
      this.selfCollision.resolve(this.particles);
      this.updateVelocities(dt);
    }
  }

  /** Сколько частица успевает пройти за кадр при ограниченной скорости подшага. */
  private reachPerFrame(frameDt: number, dt: number): number {
    return this.maxSpeed(dt) * frameDt;
  }

  private maxSpeed(dt: number): number {
    return (MAX_TRAVEL_PER_STEP * this.fullSegment) / dt;
  }

  /** v += g·dt; prev = x; x += v·dt. */
  private integrate(dt: number): void {
    const { position, previous, velocity, inverseMass, count } = this.particles;
    const gravity = GameConfig.gravity;
    const maxSpeed = this.maxSpeed(dt);

    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) {
        continue;
      }
      const o = i * PARTICLE_STRIDE;

      if (i !== this.proxy) {
        velocity[o] = velocity[o]! + gravity.x * dt;
        velocity[o + 1] = velocity[o + 1]! + gravity.y * dt;
        velocity[o + 2] = velocity[o + 2]! + gravity.z * dt;
        this.clampSpeed(o, maxSpeed);
      }

      for (let axis = 0; axis < PARTICLE_STRIDE; axis++) {
        previous[o + axis] = position[o + axis]!;
        position[o + axis] = position[o + axis]! + velocity[o + axis]! * dt;
      }
    }
  }

  private clampSpeed(offset: number, maxSpeed: number): void {
    const v = this.particles.velocity;
    const x = v[offset]!;
    const y = v[offset + 1]!;
    const z = v[offset + 2]!;
    // Math.hypot заметно медленнее обычного корня, а защита от переполнения здесь не нужна.
    const speed = Math.sqrt(x * x + y * y + z * z);

    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      v[offset] = v[offset]! * scale;
      v[offset + 1] = v[offset + 1]! * scale;
      v[offset + 2] = v[offset + 2]! * scale;
    }
  }

  private solveConstraints(dt: number, length: number): void {
    const { stretchCompliance, bendCompliance } = GameConfig.rope;
    const dt2 = dt * dt;

    for (let i = 0; i < this.proxy; i++) {
      this.projectDistance(i, i + 1, length, stretchCompliance / dt2, false);
    }
    // Тросы от якоря (long-range attachments): частица i не дальше i·L от руки,
    // даже если цепочка за подшаг не сошлась — верёвка не тянется резинкой.
    for (let i = 2; i <= this.proxy; i++) {
      this.projectDistance(ANCHOR, i, i * length, 0, true);
    }
    // Изгиб без углов, как в 14-cloth: расстояние через одну частицу.
    for (let i = 0; i < this.proxy - 1; i++) {
      this.projectDistance(i, i + 2, 2 * length, bendCompliance / dt2, false);
    }
  }

  /**
   * XPBD-ограничение расстояния: C = |xi − xj| − rest, s = −C / (wi + wj + α).
   * `stretchOnly` — только не дальше `rest` (трос), сближению не мешает.
   */
  private projectDistance(i: number, j: number, rest: number, alpha: number, stretchOnly: boolean): void {
    const { position: p, inverseMass: w } = this.particles;
    const wi = w[i]!;
    const wj = w[j]!;
    const weight = wi + wj;
    if (weight === 0) {
      return;
    }

    const oi = i * PARTICLE_STRIDE;
    const oj = j * PARTICLE_STRIDE;
    const dx = p[oi]! - p[oj]!;
    const dy = p[oi + 1]! - p[oj + 1]!;
    const dz = p[oi + 2]! - p[oj + 2]!;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const error = distance - rest;
    if (distance === 0 || (stretchOnly && error <= 0)) {
      return;
    }

    const s = -error / (weight + alpha) / distance;
    p[oi] = p[oi]! + dx * s * wi;
    p[oi + 1] = p[oi + 1]! + dy * s * wi;
    p[oi + 2] = p[oi + 2]! + dz * s * wi;
    p[oj] = p[oj]! - dx * s * wj;
    p[oj + 1] = p[oj + 1]! - dy * s * wj;
    p[oj + 2] = p[oj + 2]! - dz * s * wj;
  }

  /** Якорь и прокси тела не трогаем: их положение задают рука и Havok. */
  private solveCollisions(): void {
    for (let i = ANCHOR + 1; i < this.proxy; i++) {
      for (let c = 0; c < this.colliders.length; c++) {
        this.colliders[c]!.resolve(this.particles, i);
      }
    }
  }

  /** v = (x − prev) / dt; частицы верёвки ещё и затухают. */
  private updateVelocities(dt: number): void {
    const { position, previous, velocity, inverseMass, count } = this.particles;
    const damping = Math.max(0, 1 - GameConfig.rope.damping * dt);
    let fastest = 0;

    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) {
        continue;
      }
      const o = i * PARTICLE_STRIDE;
      const factor = i === this.proxy ? 1 : damping;

      let speedSquared = 0;
      for (let axis = 0; axis < PARTICLE_STRIDE; axis++) {
        const value = ((position[o + axis]! - previous[o + axis]!) / dt) * factor;
        velocity[o + axis] = value;
        speedSquared += value * value;
      }
      fastest = Math.max(fastest, speedSquared);
    }

    this.fastestSpeedSquared = fastest;
  }
}
