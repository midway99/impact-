import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import type { RopeCollider } from "./RopeCollider";
import type { RopePath } from "./RopePath";

/**
 * Повёрнутый параллелепипед (стена может двигаться и опрокидываться).
 * Точка переводится в локальные координаты коробки и выталкивается по оси наименьшего проникновения.
 *
 * У Мюллера такого коллайдера нет — он написан в той же идиоме: правим позицию, скорость следствие.
 */
export class BoxCollider implements RopeCollider {
  private readonly node: TransformNode;
  private readonly halfExtents: Vector3;
  private readonly radius: number;

  private readonly toWorld = new Matrix();
  private readonly toLocal = new Matrix();
  private readonly local = new Vector3();

  public constructor(node: TransformNode, halfExtents: Vector3, radius: number) {
    this.node = node;
    this.halfExtents = halfExtents;
    this.radius = radius;
  }

  public prepare(): void {
    this.toWorld.copyFrom(this.node.getWorldMatrix());
    this.toWorld.invertToRef(this.toLocal);
  }

  public resolve(path: RopePath, index: number): void {
    const point = path.points[index]!;

    Vector3.TransformCoordinatesToRef(point, this.toLocal, this.local);
    if (!this.pushOut(this.local)) {
      return;
    }

    Vector3.TransformCoordinatesToRef(this.local, this.toWorld, point);
  }

  /** Сдвигает локальную точку на ближайшую грань (с учётом радиуса). false — точка снаружи. */
  private pushOut(point: Vector3): boolean {
    const r = this.radius;
    const depthX = this.halfExtents.x + r - Math.abs(point.x);
    const depthY = this.halfExtents.y + r - Math.abs(point.y);
    const depthZ = this.halfExtents.z + r - Math.abs(point.z);

    if (depthX <= 0 || depthY <= 0 || depthZ <= 0) {
      return false;
    }

    if (depthX <= depthY && depthX <= depthZ) {
      point.x = Math.sign(point.x) * (this.halfExtents.x + r);
    } else if (depthY <= depthZ) {
      point.y = Math.sign(point.y) * (this.halfExtents.y + r);
    } else {
      point.z = Math.sign(point.z) * (this.halfExtents.z + r);
    }

    return true;
  }
}
