import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";

const MESH_NAME = "rope";

/**
 * Верёвка рисуется штатной трубкой Babylon по пути, который двигает решатель.
 *
 * Массив пути не копируется и не пересчитывается: `CreateTube` получает ровно тот же
 * `Vector3[]`, в котором работает XPBD. Так же устроен оригинал Мюллера — там массив
 * позиций решателя напрямую является вершинным буфером сцены.
 *
 * `instance` обновляет уже созданный меш, не пересобирая его; число точек пути при этом
 * меняться не может, а оно у верёвки постоянно.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly material: StandardMaterial;
  private mesh: Mesh;
  private renderedRevision = -1;

  public constructor(scene: Scene, rope: Rope) {
    const { thickness, color, tessellation } = GameConfig.rope;

    this.rope = rope;
    // До первого броска путь вырожден (все точки в нуле), а такой Babylon построить не может:
    // растягиваем его в отрезок, всё равно меш до броска скрыт.
    this.spreadInitialPath();

    this.mesh = CreateTube(
      MESH_NAME,
      { path: rope.path, radius: thickness / 2, tessellation, updatable: true },
      scene,
    );
    this.mesh.isPickable = false;
    this.mesh.isVisible = false;
    // Габариты пересчитываются не каждый кадр — без этого трубку отсекает frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new StandardMaterial("rope-material", scene);
    this.material.diffuseColor = color;
    this.material.specularColor.setAll(0);
    this.mesh.material = this.material;
    // Шейдер компилируется заранее: иначе первый показ верёвки стоит просадки кадра.
    this.material.forceCompilation(this.mesh);
  }

  public update(): void {
    if (!this.rope.isActive) {
      this.mesh.isVisible = false;
      return;
    }
    if (this.renderedRevision === this.rope.revision) {
      return;
    }

    // CreateTube внутри выделяет массив и Vector3 на каждое кольцо (tubeBuilder, tubePathArray),
    // поэтому вызываем его только когда верёвка действительно сдвинулась.
    this.mesh = CreateTube(MESH_NAME, { path: this.rope.path, instance: this.mesh });
    this.mesh.isVisible = true;
    this.renderedRevision = this.rope.revision;
  }

  private spreadInitialPath(): void {
    const path = this.rope.path;
    const step = GameConfig.rope.length / (path.length - 1);

    for (let i = 0; i < path.length; i++) {
      path[i]!.set(i * step, 0, 0);
    }
  }

  public dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}
