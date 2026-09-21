import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/** Препятствие: вытянутый вверх куб. Владеет своим мешем и материалом. */
export class Obstacle {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  public constructor(scene: Scene) {
    const { size, height, color, x, z } = GameConfig.obstacle;

    this.mesh = CreateBox("obstacle", { width: size, height, depth: size }, scene);
    this.mesh.position.set(x, height / 2, z);
    this.mesh.freezeWorldMatrix();

    this.material = new StandardMaterial("obstacle-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0.05);
    this.mesh.material = this.material;
  }

  public get transform(): Mesh {
    return this.mesh;
  }

  public dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}
