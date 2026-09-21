import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/** Персонаж: капсула с собственным материалом. Владеет своим мешем, движение — дело контроллера. */
export class Player {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  public constructor(scene: Scene) {
    const { height, radius, spawn, color } = GameConfig.player;

    this.mesh = CreateCapsule("player", { height, radius }, scene);
    this.mesh.position.copyFrom(spawn);

    this.material = new StandardMaterial("player-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0.1);
    this.mesh.material = this.material;
  }

  public get transform(): Mesh {
    return this.mesh;
  }

  /** Возврат в точку старта без аллокаций: значения копируются в существующие вектора. */
  public reset(): void {
    this.mesh.position.copyFrom(GameConfig.player.spawn);
    this.mesh.rotationQuaternion?.set(0, 0, 0, 1);
  }

  public dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}
