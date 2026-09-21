import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";

import { GameConfig } from "../core/GameConfig";
import { ParticleBuffer } from "../physics/rope/ParticleBuffer";
import type { RopeCollider } from "../physics/rope/RopeCollider";
import { RopeSolver } from "../physics/rope/RopeSolver";
import type { Player } from "./Player";

/**
 * Верёвка на собственном XPBD-решателе; Havok остаётся для куба, персонажа и окружения.
 * Частица 0 — рука персонажа, последняя — прокси брошенного куба:
 * перед шагом верёвка читает состояние куба из Havok, после — возвращает своё влияние импульсом.
 */
export class Rope {
  private readonly player: Player;
  private readonly particles: ParticleBuffer;
  private readonly solver: RopeSolver;
  private readonly proxy: number;

  private target: PhysicsBody | null = null;

  private readonly anchorFrom = new Vector3();
  private readonly anchorTo = new Vector3();
  private readonly point = new Vector3();
  private readonly velocity = new Vector3();
  private readonly targetVelocity = new Vector3();

  public constructor(player: Player, colliders: readonly RopeCollider[]) {
    this.player = player;
    this.particles = new ParticleBuffer(GameConfig.rope.particleCount + 1);
    this.proxy = this.particles.count - 1;
    this.solver = new RopeSolver(this.particles, colliders);

    const inverseMass = this.particles.inverseMass;
    inverseMass.fill(1 / GameConfig.rope.particleMass);
    inverseMass[0] = 0;
    inverseMass[this.proxy] = 1 / GameConfig.throwable.body.mass;
  }

  /** До первого броска верёвки нет. */
  public get isActive(): boolean {
    return this.target !== null;
  }

  /** Точки для отрисовки: рука, частицы, куб. */
  public get pointCount(): number {
    return this.particles.count;
  }

  public copyPointTo(index: number, result: Vector3): void {
    this.particles.readToRef(this.particles.position, index, result);
  }

  /** Бросок: частицы выстраиваются от руки до точки вылета и летят вслед за кубом. */
  public launch(origin: Vector3, velocity: Vector3, target: PhysicsBody): void {
    const { position, previous, velocity: velocities } = this.particles;

    this.anchorToRef(this.anchorTo);
    this.anchorFrom.copyFrom(this.anchorTo);

    for (let i = 0; i <= this.proxy; i++) {
      // Частица ближе к кубу летит быстрее: верёвка разматывается, а не летит комом.
      const share = i / this.proxy;
      Vector3.LerpToRef(this.anchorTo, origin, share, this.point);
      velocity.scaleToRef(share, this.velocity);

      this.particles.write(position, i, this.point);
      this.particles.write(previous, i, this.point);
      this.particles.write(velocities, i, this.velocity);
    }

    this.target = target;
  }

  /** Шаг верёвки сразу после шага Havok и с тем же `dt`. */
  public update(stepSeconds: number): void {
    if (!this.target) {
      return;
    }

    this.anchorFrom.copyFrom(this.anchorTo);
    this.anchorToRef(this.anchorTo);

    this.readTarget(this.target);
    this.solver.simulate(stepSeconds, this.anchorFrom, this.anchorTo);
    this.pushTarget(this.target);
  }

  /** Прокси = куб в том состоянии, которое Havok только что посчитал. */
  private readTarget(target: PhysicsBody): void {
    const { position, previous, velocity } = this.particles;
    const cube = target.transformNode.position;

    this.particles.write(position, this.proxy, cube);
    this.particles.write(previous, this.proxy, cube);
    target.getLinearVelocityToRef(this.targetVelocity);
    this.particles.write(velocity, this.proxy, this.targetVelocity);
  }

  /** Изменение скорости прокси — это работа верёвки над кубом; отдаём её Havok импульсом m·Δv. */
  private pushTarget(target: PhysicsBody): void {
    this.particles.readToRef(this.particles.velocity, this.proxy, this.velocity);
    this.velocity.subtractInPlace(this.targetVelocity).scaleInPlace(GameConfig.throwable.body.mass);

    target.applyImpulse(this.velocity, target.transformNode.position);
  }

  private anchorToRef(result: Vector3): void {
    this.player.position.addToRef(GameConfig.rope.anchorOffset, result);
  }
}
