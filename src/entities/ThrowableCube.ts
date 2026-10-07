import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
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
 * Куб на верёвке — он в игре один: верёвка тоже одна, а после рывка куб уходит со сцены.
 *
 * Между броском и броском не удаляется, а «паркуется»: статичное тело под полом, меш скрыт.
 * Следующий бросок переиспользует его же, поэтому в кадре не появляется ни одного `new`.
 */
export class ThrowableCube {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly aggregate: PhysicsAggregate;
  private readonly physics: HavokPlugin;

  public constructor(scene: Scene, physics: HavokPlugin) {
    const { size, color, body } = GameConfig.throwable;
    this.physics = physics;

    this.mesh = CreateBox("throwable-cube", { size }, scene);
    this.material = new StandardMaterial("throwable-cube-material", scene);
    this.material.diffuseColor = color;
    this.mesh.material = this.material;
    // Куб появляется только после броска, и его шейдер собрался бы прямо в этот момент —
    // просадкой кадра на ровном месте. Собираем заранее, как и у верёвки.
    this.material.forceCompilation(this.mesh);
    this.material.freeze();

    this.aggregate = new PhysicsAggregate(this.mesh, PhysicsShapeType.BOX, body, scene);
    this.aggregate.shape.filterMembershipMask = CollisionGroup.Cube;
    // Без этого тело не присылает события столкновений.
    this.aggregate.body.setCollisionCallbackEnabled(true);

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
    this.material.dispose();
    this.mesh.dispose();
  }
}
