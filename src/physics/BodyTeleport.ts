import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

/** Мгновенный перенос тела в точку, без ожидания шага физики. */
export class BodyTeleport {
  /**
   * Havok телепортирует только тело с включённым pre-step, поэтому включаем его на время вызова.
   * Оставлять включённым нельзя: физика каждый шаг тянула бы тело к узлу и оно зависло бы в воздухе.
   */
  public static toPosition(
    physics: HavokPlugin,
    body: PhysicsBody,
    node: TransformNode,
    position: Vector3,
  ): void {
    node.position.copyFrom(position);
    node.rotationQuaternion?.set(0, 0, 0, 1);
    node.computeWorldMatrix(true);

    body.disablePreStep = false;
    physics.setPhysicsBodyTransformation(body, node);
    body.disablePreStep = true;
  }
}
