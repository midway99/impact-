import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";

import { GameConfig } from "../core/GameConfig";
import type { Player } from "./Player";

/** Координат на точку пути: x, y, z подряд. */
const AXIS = 3;

/**
 * Верёвка без собственной физики: прямая от руки персонажа до брошенного куба.
 * Куб летит сам по себе в Havok, верёвка лишь тянется за ним и не даёт отойти дальше своей длины.
 *
 * Путь переписывается только когда концы действительно сдвинулись: у неподвижной
 * верёвки нет ни расчёта, ни перестройки геометрии.
 */
export class Rope {
  private readonly player: Player;
  private readonly count: number;
  /** Точки пути в плоском массиве: ни одного объекта на точку. */
  private readonly points: Float32Array;

  private target: PhysicsBody | null = null;
  private stateRevision = 0;
  private dirty = false;

  private readonly anchor = new Vector3();
  private readonly end = new Vector3();
  private readonly lastAnchor = new Vector3();
  private readonly lastEnd = new Vector3();
  private readonly outward = new Vector3();
  /** Квадрат сдвига конца, ниже которого путь считается прежним: 1 мм. */
  private static readonly MOVED_SQUARED = 1e-6;

  public constructor(player: Player) {
    this.player = player;
    this.count = GameConfig.rope.pointCount;
    this.points = new Float32Array(this.count * AXIS);
  }

  /** До первого броска верёвки нет. */
  public get isActive(): boolean {
    return this.target !== null;
  }

  /** Точки для отрисовки: рука, промежуточные, куб. */
  public get pointCount(): number {
    return this.count;
  }

  /** Меняется только когда путь мог измениться. */
  public get revision(): number {
    return this.stateRevision;
  }

  public copyPointTo(index: number, result: Vector3): void {
    const at = index * AXIS;

    result.set(this.points[at]!, this.points[at + 1]!, this.points[at + 2]!);
  }

  /** Бросок: верёвка цепляется за улетевший куб. */
  public launch(target: PhysicsBody): void {
    this.target = target;
    this.dirty = true;
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

    this.anchorToRef(this.anchor);
    this.anchor.subtractToRef(this.target.transformNode.position, this.outward);

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

  /** Обновление сразу после шага Havok: куб уже на новом месте. */
  public update(): void {
    if (!this.target) {
      return;
    }

    this.anchorToRef(this.anchor);
    this.end.copyFrom(this.target.transformNode.position);

    if (!this.dirty && !this.endsMoved()) {
      return;
    }

    this.writeLine();
    this.lastAnchor.copyFrom(this.anchor);
    this.lastEnd.copyFrom(this.end);
    this.dirty = false;
    this.stateRevision++;
  }

  private endsMoved(): boolean {
    const moved = Rope.MOVED_SQUARED;

    return (
      Vector3.DistanceSquared(this.anchor, this.lastAnchor) > moved ||
      Vector3.DistanceSquared(this.end, this.lastEnd) > moved
    );
  }

  /** Равномерные точки от руки до куба. */
  private writeLine(): void {
    const last = this.count - 1;
    const stepX = (this.end.x - this.anchor.x) / last;
    const stepY = (this.end.y - this.anchor.y) / last;
    const stepZ = (this.end.z - this.anchor.z) / last;

    for (let i = 0; i < this.count; i++) {
      const at = i * AXIS;

      this.points[at] = this.anchor.x + stepX * i;
      this.points[at + 1] = this.anchor.y + stepY * i;
      this.points[at + 2] = this.anchor.z + stepZ * i;
    }
  }

  private anchorToRef(result: Vector3): void {
    this.player.position.addToRef(GameConfig.rope.anchorOffset, result);
  }
}
