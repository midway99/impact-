import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/**
 * Полоса препятствий из одинаковых кубов.
 * Геометрия и материал создаются один раз, каждый куб — инстанс: один draw call на всё поле.
 */
export class ObstacleField {
  private readonly source: Mesh;
  private readonly material: StandardMaterial;
  private readonly instances: readonly InstancedMesh[];

  public constructor(scene: Scene) {
    const { size, color, rows, columns, spacingX, spacingZ, firstRowZ, rowOffsetX } =
      GameConfig.obstacles;

    this.source = CreateBox("obstacle", { width: size, height: size, depth: size }, scene);

    this.material = new StandardMaterial("obstacle-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0.05);
    this.source.material = this.material;
    this.source.isVisible = false;

    const instances: InstancedMesh[] = new Array<InstancedMesh>(rows * columns);
    const halfSpan = ((columns - 1) * spacingX) / 2;
    const y = size / 2;

    for (let row = 0; row < rows; row++) {
      // Каждый второй ряд смещён, чтобы между кубами оставался проход по диагонали.
      const offsetX = row % 2 === 0 ? 0 : rowOffsetX;
      const z = firstRowZ + row * spacingZ;

      for (let column = 0; column < columns; column++) {
        const instance = this.source.createInstance(`obstacle-${row}-${column}`);
        instance.position.set(column * spacingX - halfSpan + offsetX, y, z);
        instance.freezeWorldMatrix();
        instances[row * columns + column] = instance;
      }
    }

    this.instances = instances;
  }

  public get boxes(): readonly InstancedMesh[] {
    return this.instances;
  }

  public dispose(): void {
    for (let i = 0; i < this.instances.length; i++) {
      this.instances[i]?.dispose();
    }
    this.material.dispose();
    this.source.dispose();
  }
}
