import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsMotionType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import { BodyTeleport } from "../physics/BodyTeleport";
import { CollisionGroup } from "../physics/CollisionGroup";

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
    this.mesh.position.copyFrom(GameConfig.parkPosition);
    this.aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.BOX,
      GameConfig.throwable.body,
      scene,
    );
    this.aggregate.shape.filterMembershipMask = CollisionGroup.Cube;

    this.park();
  }

  public get body(): PhysicsBody {
    return this.aggregate.body;
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
    this.placeAt(GameConfig.parkPosition);
    this.mesh.isVisible = false;
  }

  private placeAt(position: Vector3): void {
    BodyTeleport.toPosition(this.physics, this.aggregate.body, this.mesh, position);
  }

  public dispose(): void {
    this.aggregate.dispose();
    this.mesh.dispose();
  }
}
