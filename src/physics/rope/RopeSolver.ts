import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../../core/GameConfig";
import type { RopeCollider } from "./RopeCollider";
import type { RopePath } from "./RopePath";
import type { SelfCollision } from "./SelfCollision";

const ANCHOR = 0;
/** Доля толщины, которую точка может пройти за подшаг (Мюллер, 15-selfCollision): защита от туннелирования. */
const MAX_TRAVEL_PER_STEP = 0.2;

/**
 * XPBD-решатель по схеме Ten Minute Physics (14-cloth, 15-selfCollision):
 * много подшагов, в каждом — предсказание позиций, проекция ограничений, скорость из смещения.
 *
 * Решатель двигает точки самого пути трубки: отдельного представления «частиц» нет.
 * Точка 0 — якорь на руке (её позицию задаёт владелец), последняя — брошенный куб,
 * она интегрируется без гравитации, потому что её ведёт Havok.
 */
export class RopeSolver {
  private readonly path: RopePath;
  private readonly colliders: readonly RopeCollider[];
  private readonly selfCollision: SelfCollision;
  private readonly proxy: number;
  private readonly segmentLength: number;

  private readonly anchor = new Vector3();
  private readonly delta = new Vector3();
  /** Квадрат самой большой скорости точки в прошлом шаге — по нему верёвка засыпает. */
  private fastestSpeedSquared = 0;

  public constructor(
    path: RopePath,
    colliders: readonly RopeCollider[],
    selfCollision: SelfCollision,
  ) {
    this.path = path;
    this.colliders = colliders;
    this.selfCollision = selfCollision;
    this.proxy = path.count - 1;
    this.segmentLength = GameConfig.rope.length / this.proxy;
  }

  /** Насколько быстро двигалась верёвка в прошлом шаге: 0 — стоит на месте. */
  public get motion(): number {
    return this.fastestSpeedSquared;
  }

  public simulate(frameDt: number, anchorFrom: Vector3, anchorTo: Vector3): void {
    const substeps = GameConfig.rope.substeps;
    const dt = frameDt / substeps;

    for (let c = 0; c < this.colliders.length; c++) {
      this.colliders[c]!.prepare();
    }

    // Кандидаты на самопересечение — раз в кадр, с запасом на путь точки за этот кадр.
    this.selfCollision.prepare(this.path, this.maxSpeed(dt) * frameDt);

    for (let step = 0; step < substeps; step++) {
      // Якорь идёт за рукой плавно внутри кадра, иначе верёвку дёргает раз в кадр.
      Vector3.LerpToRef(anchorFrom, anchorTo, (step + 1) / substeps, this.anchor);
      this.path.points[ANCHOR]!.copyFrom(this.anchor);

      this.integrate(dt);
      this.solveConstraints(dt);
      this.solveCollisions();
      this.selfCollision.resolve(this.path);
      this.updateVelocities(dt);
    }
  }

  private maxSpeed(dt: number): number {
    return (MAX_TRAVEL_PER_STEP * GameConfig.rope.thickness) / dt;
  }

  /** v += g·dt; prev = x; x += v·dt. */
  private integrate(dt: number): void {
    const { points, previous, velocity, inverseMass, count } = this.path;
    const gravity = GameConfig.gravity;
    const maxSpeed = this.maxSpeed(dt);

    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) {
        continue;
      }

      const point = points[i]!;
      const speed = velocity[i]!;

      if (i !== this.proxy) {
        gravity.scaleAndAddToRef(dt, speed);
        this.clampSpeed(speed, maxSpeed);
      }

      previous[i]!.copyFrom(point);
      speed.scaleAndAddToRef(dt, point);
    }
  }

  private clampSpeed(speed: Vector3, maxSpeed: number): void {
    const lengthSquared = speed.lengthSquared();

    if (lengthSquared > maxSpeed * maxSpeed) {
      speed.scaleInPlace(maxSpeed / Math.sqrt(lengthSquared));
    }
  }

  private solveConstraints(dt: number): void {
    const { stretchCompliance, bendCompliance } = GameConfig.rope;
    const dt2 = dt * dt;
    const length = this.segmentLength;

    for (let i = 0; i < this.proxy; i++) {
      this.projectDistance(i, i + 1, length, stretchCompliance / dt2, false);
    }
    // Тросы от якоря (long-range attachments): точка i не дальше i·L от руки,
    // даже если цепочка за подшаг не сошлась — верёвка не тянется резинкой.
    for (let i = 2; i <= this.proxy; i++) {
      this.projectDistance(ANCHOR, i, i * length, 0, true);
    }
    // Изгиб без углов, как в 14-cloth: расстояние через одну точку.
    for (let i = 0; i < this.proxy - 1; i++) {
      this.projectDistance(i, i + 2, 2 * length, bendCompliance / dt2, false);
    }
  }

  /**
   * XPBD-ограничение расстояния: C = |xi − xj| − rest, s = −C / (wi + wj + α).
   * `stretchOnly` — только не дальше `rest` (трос), сближению не мешает.
   */
  private projectDistance(i: number, j: number, rest: number, alpha: number, stretchOnly: boolean): void {
    const { points, inverseMass } = this.path;
    const wi = inverseMass[i]!;
    const wj = inverseMass[j]!;
    const weight = wi + wj;
    if (weight === 0) {
      return;
    }

    const a = points[i]!;
    const b = points[j]!;
    a.subtractToRef(b, this.delta);

    const distance = this.delta.length();
    const error = distance - rest;
    if (distance === 0 || (stretchOnly && error <= 0)) {
      return;
    }

    const s = -error / (weight + alpha) / distance;
    this.delta.scaleAndAddToRef(s * wi, a);
    this.delta.scaleAndAddToRef(-s * wj, b);
  }

  /** Якорь и куб не трогаем: их положение задают рука и Havok. */
  private solveCollisions(): void {
    for (let i = ANCHOR + 1; i < this.proxy; i++) {
      for (let c = 0; c < this.colliders.length; c++) {
        this.colliders[c]!.resolve(this.path, i);
      }
    }
  }

  /** v = (x − prev) / dt; точки верёвки ещё и затухают. */
  private updateVelocities(dt: number): void {
    const { points, previous, velocity, inverseMass, count } = this.path;
    const damping = Math.max(0, 1 - GameConfig.rope.damping * dt);
    let fastest = 0;

    for (let i = 0; i < count; i++) {
      if (inverseMass[i] === 0) {
        continue;
      }

      const speed = velocity[i]!;
      points[i]!.subtractToRef(previous[i]!, speed);
      speed.scaleInPlace((i === this.proxy ? 1 : damping) / dt);

      const speedSquared = speed.lengthSquared();
      if (speedSquared > fastest) {
        fastest = speedSquared;
      }
    }

    this.fastestSpeedSquared = fastest;
  }
}
