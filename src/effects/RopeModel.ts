import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0";

import { GameConfig } from "../core/GameConfig";
import { RopeShape } from "./RopeShape";

/**
 * Файл модели, если его положили в `src/assets`. Перебор, а не прямой импорт: пока файла
 * нет, список просто пуст, а сборка не падает на отсутствующем модуле.
 */
const MODELS = import.meta.glob<string>("../assets/rope.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

/**
 * Откуда берётся геометрия верёвки — **единственное место, которое нужно менять,
 * чтобы подключить модель от моделлера.**
 *
 * Положи меш в `src/assets/rope.glb` — он подхватится сам. Пока файла нет, заготовка
 * строится кодом: прямой цилиндр нужной длины и толщины, нарезанный поперёк на `sections`.
 *
 * Требования к модели: прямой отрезок вдоль одной оси (не изогнутый и не смотанный —
 * положение вдоль верёвки раскладывается линейно), трансформы применены, сечение замкнуто,
 * торцы не нужны, UV обязательна. Какая именно ось длины — неважно, `RopeShape` находит её
 * по габаритам. Густота сетки с числом частиц решателя совпадать не обязана: между опорными
 * точками кривой всё интерполируется.
 */
export class RopeModel {
  public static async load(scene: Scene): Promise<RopeShape> {
    const source = await RopeModel.open(scene);
    const shape = RopeShape.fromMesh(source);

    // Исходник больше не нужен: геометрия разобрана, рисуем мы свой меш.
    source.dispose();

    return shape;
  }

  private static async open(scene: Scene): Promise<Mesh> {
    const url = Object.values(MODELS)[0];

    return url === undefined ? RopeModel.createPlaceholder(scene) : RopeModel.loadFile(url, scene);
  }

  private static async loadFile(url: string, scene: Scene): Promise<Mesh> {
    const container = await LoadAssetContainerAsync(url, scene);
    const parts = container.meshes.filter(
      (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0,
    );
    // MergeMeshes запекает мировые матрицы — заодно уходит разворот осей glTF.
    const model = Mesh.MergeMeshes(parts, true, true, undefined, false, true);

    if (!model) {
      throw new Error(`Модель верёвки ${url} не содержит геометрии`);
    }

    return model;
  }

  private static createPlaceholder(scene: Scene): Mesh {
    const { length, thickness, tessellation, modelSections } = GameConfig.rope;

    return CreateCylinder(
      "rope-placeholder",
      {
        height: length,
        diameter: thickness,
        tessellation,
        subdivisions: modelSections - 1,
        cap: Mesh.NO_CAP,
      },
      scene,
    );
  }
}
