import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsMotionType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/**
 * Куб из пула: инстанс общего меша + своё тело.
 * Не удаляется из мира, а «паркуется»: статичное тело под полом, меш скрыт.
 */
export class ThrowableCube {
  private readonly mesh: InstancedMesh;
  private readonly aggregate: PhysicsAggregate;
  private readonly physics: HavokPlugin;

  public constructor(source: Mesh, index: number, physics: HavokPlugin, scene: Scene) {
    this.physics = physics;

    this.mesh = source.createInstance(`throwable-cube-${index}`);
    this.mesh.position.copyFrom(GameConfig.throwable.parkPosition);
    this.aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.BOX,
      GameConfig.throwable.body,
      scene,
    );

    this.park();
  }

  public launch(position: Vector3, velocity: Vector3): void {
    this.aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.placeAt(position);
    this.aggregate.body.setLinearVelocity(velocity);
    this.aggregate.body.setAngularVelocity(Vector3.ZeroReadOnly);
    this.mesh.isVisible = true;
  }

  /** Вывод из игры без dispose: тело остаётся в мире Havok, но статичное и под полом. */
  public park(): void {
    this.aggregate.body.setMotionType(PhysicsMotionType.STATIC);
    this.placeAt(GameConfig.throwable.parkPosition);
    this.mesh.isVisible = false;
  }

  /**
   * Телепорт: ставим меш и напрямую синхронизируем с ним тело, без ожидания шага физики.
   * Havok телепортирует только тело с включённым pre-step, поэтому включаем его на время вызова.
   * Оставлять включённым нельзя: физика каждый шаг тянула бы тело к мешу и куб завис бы в воздухе.
   */
  private placeAt(position: Vector3): void {
    const body = this.aggregate.body;

    this.mesh.position.copyFrom(position);
    this.mesh.rotationQuaternion?.set(0, 0, 0, 1);
    this.mesh.computeWorldMatrix(true);

    body.disablePreStep = false;
    this.physics.setPhysicsBodyTransformation(body, this.mesh);
    body.disablePreStep = true;
  }

  public dispose(): void {
    this.aggregate.dispose();
    this.mesh.dispose();
  }
}
