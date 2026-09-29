import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";

import { GameConfig } from "../core/GameConfig";
import type { RopeCollider } from "../physics/rope/RopeCollider";
import { RopePath } from "../physics/rope/RopePath";
import { RopeSolver } from "../physics/rope/RopeSolver";
import { SelfCollision } from "../physics/rope/SelfCollision";
import type { Player } from "./Player";

/**
 * Верёвка на XPBD-решателе; Havok остаётся для куба, персонажа и окружения.
 * Точка 0 пути — рука персонажа, последняя — брошенный куб: перед шагом верёвка
 * читает его состояние из Havok, после — возвращает своё влияние импульсом.
 */
export class Rope {
  private readonly player: Player;
  private readonly rope: RopePath;
  private readonly solver: RopeSolver;
  private readonly proxy: number;

  private target: PhysicsBody | null = null;
  private stateRevision = 0;

  private readonly anchorFrom = new Vector3();
  private readonly anchorTo = new Vector3();
  private readonly velocity = new Vector3();
  private readonly targetVelocity = new Vector3();
  private readonly outward = new Vector3();
  /** Квадрат скорости, ниже которой движение считается покоем: 0.1 м/с — 1.6 мм за кадр. */
  private static readonly REST_SPEED_SQUARED = 0.01;

  public constructor(player: Player, colliders: readonly RopeCollider[]) {
    const { pointCount, nodeMass, selfDistance } = GameConfig.rope;

    this.player = player;
    this.rope = new RopePath(pointCount);
    this.proxy = this.rope.count - 1;
    this.solver = new RopeSolver(
      this.rope,
      colliders,
      new SelfCollision(this.rope.count, selfDistance),
    );

    const inverseMass = this.rope.inverseMass;
    inverseMass.fill(1 / nodeMass);
    inverseMass[0] = 0;
    inverseMass[this.proxy] = 1 / GameConfig.throwable.body.mass;
  }

  /** До первого броска верёвки нет. */
  public get isActive(): boolean {
    return this.target !== null;
  }

  /** Путь трубки: тот самый массив, который двигает решатель. */
  public get path(): Vector3[] {
    return this.rope.points;
  }

  /** Меняется только когда путь мог измениться. */
  public get revision(): number {
    return this.stateRevision;
  }

  /** Бросок: путь выстраивается от руки до точки вылета и летит вслед за кубом. */
  public launch(origin: Vector3, velocity: Vector3, target: PhysicsBody): void {
    const { points, previous, velocity: velocities } = this.rope;

    this.anchorToRef(this.anchorTo);
    this.anchorFrom.copyFrom(this.anchorTo);

    for (let i = 0; i <= this.proxy; i++) {
      // Точка ближе к кубу летит быстрее: верёвка разматывается, а не летит комом.
      const share = i / this.proxy;

      Vector3.LerpToRef(this.anchorTo, origin, share, points[i]!);
      previous[i]!.copyFrom(points[i]!);
      velocity.scaleToRef(share, velocities[i]!);
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
    if (!this.target || this.target.getMotionType() !== PhysicsMotionType.STATIC) {
      return;
    }

    this.anchorToRef(this.anchorTo);
    this.anchorTo.subtractToRef(this.target.transformNode.position, this.outward);

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

    // Покоящуюся верёвку считать незачем: ни рука, ни куб, ни сам путь не двигаются.
    if (this.isAtRest()) {
      return;
    }

    this.solver.simulate(stepSeconds, this.anchorFrom, this.anchorTo);
    this.pushTarget(this.target);
    this.stateRevision++;
  }

  private isAtRest(): boolean {
    const rest = Rope.REST_SPEED_SQUARED;

    return (
      this.solver.motion < rest &&
      this.targetVelocity.lengthSquared() < rest &&
      Vector3.DistanceSquared(this.anchorFrom, this.anchorTo) < rest
    );
  }

  /** Последняя точка пути = куб в том состоянии, которое Havok только что посчитал. */
  private readTarget(target: PhysicsBody): void {
    const cube = target.transformNode.position;

    this.rope.points[this.proxy]!.copyFrom(cube);
    this.rope.previous[this.proxy]!.copyFrom(cube);
    target.getLinearVelocityToRef(this.targetVelocity);
    this.rope.velocity[this.proxy]!.copyFrom(this.targetVelocity);

    // Примёрзший куб верёвка сдвинуть не может: для решателя он закреплён, как рука.
    const isFrozen = target.getMotionType() === PhysicsMotionType.STATIC;
    this.rope.inverseMass[this.proxy] = isFrozen ? 0 : 1 / GameConfig.throwable.body.mass;
  }

  /** Изменение скорости последней точки — это работа верёвки над кубом; отдаём её Havok импульсом m·Δv. */
  private pushTarget(target: PhysicsBody): void {
    // Импульсы к статичному телу не применяются — не тратим кадр впустую.
    if (this.rope.inverseMass[this.proxy] === 0) {
      return;
    }

    this.rope.velocity[this.proxy]!.subtractToRef(this.targetVelocity, this.velocity);
    this.velocity.scaleInPlace(GameConfig.throwable.body.mass);

    target.applyImpulse(this.velocity, target.transformNode.position);
  }

  private anchorToRef(result: Vector3): void {
    this.player.position.addToRef(GameConfig.rope.anchorOffset, result);
  }
}
