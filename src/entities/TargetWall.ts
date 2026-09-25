import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import { CollisionGroup } from "../physics/CollisionGroup";

/** Стена-мишень: неподвижная плита, в которую бьёт персонаж. Владеет своим мешем и материалом. */
export class TargetWall {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly aggregate: PhysicsAggregate;
  /** Половины габаритов в локальных осях — для коллайдера верёвки. */
  public readonly halfExtents: Vector3;

  public constructor(scene: Scene) {
    const { width, height, depth, color, x, z } = GameConfig.wall;

    this.mesh = CreateBox("target-wall", { width, height, depth }, scene);
    this.halfExtents = new Vector3(width / 2, height / 2, depth / 2);
    this.mesh.position.set(x, height / 2, z);

    this.material = new StandardMaterial("target-wall-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0.05);
    this.mesh.material = this.material;

    // Тело динамическое: стену можно сдвинуть и опрокинуть ударом.
    this.aggregate = new PhysicsAggregate(this.mesh, PhysicsShapeType.BOX, GameConfig.wall.body, scene);
    this.aggregate.shape.filterMembershipMask = CollisionGroup.Wall;
  }

  public get body(): PhysicsAggregate {
    return this.aggregate;
  }

  public get transform(): Mesh {
    return this.mesh;
  }

  public dispose(): void {
    this.aggregate.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
