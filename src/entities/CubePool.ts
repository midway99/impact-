import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import { ThrowableCube } from "./ThrowableCube";

/**
 * Пул бросаемых кубов, созданный заранее: во время игры ни одного `new` и `dispose`.
 * Геометрия и материал общие, каждый куб — инстанс.
 */
export class CubePool {
  private readonly source: Mesh;
  private readonly material: StandardMaterial;
  private readonly cubes: readonly ThrowableCube[];
  private next = 0;

  public constructor(scene: Scene, physics: HavokPlugin) {
    const { size, color, poolSize } = GameConfig.throwable;

    this.source = CreateBox("throwable-cube", { size }, scene);
    this.source.isVisible = false;

    this.material = new StandardMaterial("throwable-cube-material", scene);
    this.material.diffuseColor = color;
    this.source.material = this.material;

    const cubes = new Array<ThrowableCube>(poolSize);
    for (let i = 0; i < poolSize; i++) {
      cubes[i] = new ThrowableCube(this.source, i, physics, scene);
    }
    this.cubes = cubes;
  }

  /** Следующий куб по кругу: когда пул исчерпан, переиспользуется самый старый. Возвращает его тело. */
  public launchNext(position: Vector3, velocity: Vector3): PhysicsBody | undefined {
    const cube = this.cubes[this.next];
    this.next = (this.next + 1) % this.cubes.length;
    cube?.launch(position, velocity);

    return cube?.body;
  }

  public dispose(): void {
    for (let i = 0; i < this.cubes.length; i++) {
      this.cubes[i]?.dispose();
    }
    this.material.dispose();
    this.source.dispose();
  }
}
