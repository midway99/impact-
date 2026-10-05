import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import { RopeShape } from "./RopeShape";

/**
 * Откуда берётся геометрия верёвки — **единственное место, которое нужно менять,
 * чтобы подключить модель от моделлера.**
 *
 * Пока модели нет, заготовка строится кодом: прямой цилиндр нужной длины и толщины,
 * нарезанный поперёк на столько сечений, сколько у рендерера опорных точек.
 *
 * Чтобы поставить настоящую модель, достаточно загрузить меш и отдать его в `RopeShape`:
 *
 * ```ts
 * import ropeUrl from "../assets/rope.glb?url";
 *
 * const container = await LoadAssetContainerAsync(ropeUrl, scene);
 * const parts = container.meshes.filter(
 *   (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
 * );
 * // MergeMeshes запекает мировые матрицы — заодно уходит разворот осей glTF
 * const model = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
 * ```
 *
 * Загрузка асинхронная, поэтому `Game` придётся создавать через асинхронную фабрику.
 * Понадобится `@babylonjs/loaders` и side-effect импорт `@babylonjs/loaders/glTF/2.0`.
 *
 * Требования к модели: прямой отрезок вдоль одной оси, трансформы применены, сечение
 * замкнуто, торцы не нужны, UV обязательна. Ориентация в редакторе значения не имеет —
 * ось длины `RopeShape` определяет сам. Густота сетки с числом частиц решателя совпадать
 * не обязана: между опорными точками кривой всё интерполируется.
 */
export class RopeModel {
  public static load(scene: Scene, sections: number): RopeShape {
    const source = RopeModel.createPlaceholder(scene, sections);
    const shape = RopeShape.fromMesh(source);

    // Заготовка больше не нужна: геометрия разобрана, рисуем мы свой меш.
    source.dispose();

    return shape;
  }

  private static createPlaceholder(scene: Scene, sections: number): Mesh {
    const { length, thickness, tessellation } = GameConfig.rope;

    return CreateCylinder(
      "rope-placeholder",
      {
        height: length,
        diameter: thickness,
        tessellation,
        subdivisions: sections - 1,
        cap: Mesh.NO_CAP,
      },
      scene,
    );
  }
}
