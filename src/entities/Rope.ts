import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";

import { GameConfig } from "../core/GameConfig";
import { ParticleBuffer } from "../physics/rope/ParticleBuffer";
import type { RopeCollider } from "../physics/rope/RopeCollider";
import { RopeSolver } from "../physics/rope/RopeSolver";
import { SelfCollision } from "../physics/rope/SelfCollision";
import type { Player } from "./Player";

/** Первая точка верёвки — рука персонажа. */
const ANCHOR = 0;

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
  private stateRevision = 0;

  private readonly anchorFrom = new Vector3();
  private readonly anchorTo = new Vector3();
  private readonly point = new Vector3();
  private readonly velocity = new Vector3();
  private readonly targetVelocity = new Vector3();
  private readonly outward = new Vector3();
  /** Квадрат скорости, ниже которой движение считается покоем: 0.1 м/с — 1.6 мм за кадр. */
  private static readonly REST_SPEED_SQUARED = 0.01;
  /** Квадрат допустимого отрыва начала верёвки от руки: 1 мм. */
  private static readonly ANCHOR_DRIFT_SQUARED = 1e-6;

  public constructor(player: Player, colliders: readonly RopeCollider[]) {
    this.player = player;
    this.particles = new ParticleBuffer(GameConfig.rope.particleCount + 1);
    this.proxy = this.particles.count - 1;
    this.solver = new RopeSolver(
      this.particles,
      colliders,
      new SelfCollision(this.particles.count, GameConfig.rope.selfDistance),
    );

    const inverseMass = this.particles.inverseMass;
    inverseMass.fill(1 / GameConfig.rope.particleMass);
    inverseMass[ANCHOR] = 0;
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

  /**
   * Место, за которое верёвка держится, или `null`, пока куб летит.
   * Примёрзший к стене куб для верёвки неподвижен — это и есть крепление.
   */
  public get attachment(): Vector3 | null {
    if (!this.target || this.target.getMotionType() !== PhysicsMotionType.STATIC) {
      return null;
    }

    return this.target.transformNode.position;
  }

  /** Меняется только когда позиции частиц могли измениться. */
  public get revision(): number {
    return this.stateRevision;
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
    this.stateRevision++;
  }

  /**
   * Поводок: убирает из направления движения составляющую, которая уводит персонажа
   * дальше длины верёвки. Ходить вдоль и обратно к кубу по-прежнему можно.
   */
  public clampMovement(direction: Vector3): void {
    // Динамический куб верёвка просто потащит за собой — ограничивать движение не нужно.
    const attachment = this.attachment;
    if (!attachment) {
      return;
    }

    this.anchorToRef(this.anchorTo);
    this.anchorTo.subtractToRef(attachment, this.outward);

    const distance = this.outward.length();
    if (distance < GameConfig.rope.length || distance === 0) {
      return;
    }

    // Составляющая ввода вдоль «от куба»: если положительная — верёвка её не пускает.
    this.outward.scaleInPlace(1 / distance);
    const stretching = Vector3.Dot(direction, this.outward);
    if (stretching > 0) {
      this.outward.scaleAndAddToRef(-stretching, direction);
    }
  }

  /** Шаг верёвки сразу после шага Havok и с тем же `dt`. */
  public update(stepSeconds: number): void {
    if (!this.target) {
      return;
    }

    this.anchorFrom.copyFrom(this.anchorTo);
    this.anchorToRef(this.anchorTo);

    this.readTarget(this.target);

    // Покоящуюся верёвку считать незачем: ни рука, ни куб, ни сами частицы не двигаются.
    if (this.isAtRest()) {
      return;
    }

    this.solver.simulate(stepSeconds, this.anchorFrom, this.anchorTo);
    this.pushTarget(this.target);
    this.stateRevision++;
  }

  /**
   * Верёвка спит, только когда стоят и она сама, и куб, и рука.
   *
   * Про руку спрашиваем не «сдвинулась ли за кадр», а «далеко ли она от начала верёвки»:
   * спящая верёвка свою первую точку не обновляет, поэтому медленный шаг остался бы
   * ниже покадрового порога, а разрыв копился бы кадр за кадром — верёвка отрывалась от руки.
   */
  private isAtRest(): boolean {
    const rest = Rope.REST_SPEED_SQUARED;

    this.particles.readToRef(this.particles.position, ANCHOR, this.point);

    return (
      this.solver.motion < rest &&
      this.targetVelocity.lengthSquared() < rest &&
      Vector3.DistanceSquared(this.anchorTo, this.point) < Rope.ANCHOR_DRIFT_SQUARED
    );
  }

  /** Прокси = куб в том состоянии, которое Havok только что посчитал. */
  private readTarget(target: PhysicsBody): void {
    const { position, previous, velocity } = this.particles;
    const cube = target.transformNode.position;

    this.particles.write(position, this.proxy, cube);
    this.particles.write(previous, this.proxy, cube);
    target.getLinearVelocityToRef(this.targetVelocity);
    this.particles.write(velocity, this.proxy, this.targetVelocity);

    // Примёрзший куб верёвка сдвинуть не может: для решателя он закреплён, как рука.
    const isFrozen = target.getMotionType() === PhysicsMotionType.STATIC;
    this.particles.inverseMass[this.proxy] = isFrozen ? 0 : 1 / GameConfig.throwable.body.mass;
  }

  /** Изменение скорости прокси — это работа верёвки над кубом; отдаём её Havok импульсом m·Δv. */
  private pushTarget(target: PhysicsBody): void {
    // Импульсы к статичному телу не применяются — не тратим кадр впустую.
    if (this.particles.inverseMass[this.proxy] === 0) {
      return;
    }

    this.particles.readToRef(this.particles.velocity, this.proxy, this.velocity);
    this.velocity.subtractInPlace(this.targetVelocity).scaleInPlace(GameConfig.throwable.body.mass);

    target.applyImpulse(this.velocity, target.transformNode.position);
  }

  private anchorToRef(result: Vector3): void {
    this.player.position.addToRef(GameConfig.rope.anchorOffset, result);
  }
}
