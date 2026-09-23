import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../../core/GameConfig";
import { PARTICLE_STRIDE } from "./ParticleBuffer";
import type { ParticleBuffer } from "./ParticleBuffer";
import type { RopeCollider } from "./RopeCollider";

const ANCHOR = 0;
/** Доля толщины, которую частица может пройти за подшаг (Мюллер, 15-selfCollision): защита от туннелирования. */
const MAX_TRAVEL_PER_STEP = 0.2;

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
  private readonly proxy: number;
  private readonly segmentLength: number;
  private readonly anchor = new Vector3();

  public constructor(particles: ParticleBuffer, colliders: readonly RopeCollider[]) {
    this.particles = particles;
    this.colliders = colliders;
    this.proxy = particles.count - 1;
    this.segmentLength = GameConfig.rope.length / this.proxy;
  }

  public simulate(frameDt: number, anchorFrom: Vector3, anchorTo: Vector3): void {
    const substeps = GameConfig.rope.substeps;
    const dt = frameDt / substeps;

    for (let c = 0; c < this.colliders.length; c++) {
      this.colliders[c]!.prepare();
    }

    for (let step = 0; step < substeps; step++) {
      // Якорь идёт за рукой плавно внутри кадра, иначе верёвку дёргает раз в кадр.
      Vector3.LerpToRef(anchorFrom, anchorTo, (step + 1) / substeps, this.anchor);
      this.particles.write(this.particles.position, ANCHOR, this.anchor);

      this.integrate(dt);
      this.solveConstraints(dt);
      this.solveCollisions();
      this.updateVelocities(dt);
    }
  }

  /** v += g·dt; prev = x; x += v·dt. */
  private integrate(dt: number): void {
    const { position, previous, velocity, inverseMass, count } = this.particles;
    const gravity = GameConfig.gravity;
    const maxSpeed = (MAX_TRAVEL_PER_STEP * GameConfig.rope.radius * 2) / dt;

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
    const speed = Math.hypot(v[offset]!, v[offset + 1]!, v[offset + 2]!);

    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      v[offset] = v[offset]! * scale;
      v[offset + 1] = v[offset + 1]! * scale;
      v[offset + 2] = v[offset + 2]! * scale;
    }
  }

  private solveConstraints(dt: number): void {
    const { stretchCompliance, bendCompliance } = GameConfig.rope;
    const dt2 = dt * dt;
    const length = this.segmentLength;

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

    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) {
        continue;
      }
      const o = i * PARTICLE_STRIDE;
      const factor = i === this.proxy ? 1 : damping;

      for (let axis = 0; axis < PARTICLE_STRIDE; axis++) {
        velocity[o + axis] = ((position[o + axis]! - previous[o + axis]!) / dt) * factor;
      }
    }
  }
}
