import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/** Персонаж: капсула с телом Havok. Контроллеры двигают его только через методы. */
export class Player {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly aggregate: PhysicsAggregate;
  private readonly velocity = new Vector3();

  public constructor(scene: Scene) {
    const { height, radius, spawn, color } = GameConfig.player;

    this.mesh = CreateCapsule("player", { height, radius }, scene);
    this.mesh.position.copyFrom(spawn);

    this.material = new StandardMaterial("player-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0.1);
    this.mesh.material = this.material;

    this.aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.CAPSULE,
      GameConfig.player.body,
      scene,
    );
    // Нулевой момент инерции: персонаж не заваливается набок и стоит вертикально.
    this.aggregate.body.setMassProperties({ inertia: Vector3.ZeroReadOnly });
  }

  public get transform(): Mesh {
    return this.mesh;
  }

  public get position(): Vector3 {
    return this.mesh.position;
  }

  /** Горизонтальная скорость по направлению ввода; вертикальную оставляем гравитации. */
  public move(direction: Vector3): void {
    const body = this.aggregate.body;

    body.getLinearVelocityToRef(this.velocity);
    this.velocity.x = direction.x * GameConfig.player.speed;
    this.velocity.z = direction.z * GameConfig.player.speed;
    body.setLinearVelocity(this.velocity);
  }

  /** Возврат в точку старта: тело телепортируется и теряет накопленную скорость. */
  public reset(): void {
    this.mesh.position.copyFrom(GameConfig.player.spawn);
    this.mesh.rotationQuaternion?.set(0, 0, 0, 1);
    this.aggregate.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.aggregate.body.setAngularVelocity(Vector3.ZeroReadOnly);
  }

  public dispose(): void {
    this.aggregate.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
