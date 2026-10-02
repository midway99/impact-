import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";
import { RopeTexture } from "./RopeTexture";

const MESH_NAME = "rope";
/** Уровень анизотропной фильтрации витья: узор идёт вдоль сильно вытянутой поверхности. */
const ANISOTROPY = 16;
/** Доля выраженности прядей, уходящая в выпуклость трубки; остальное — в рельеф теней. */
const BULGE_SHARE = 0.7;
/** Колец на период выпуклости: меньше четырёх — и волна вырождается в биения. */
const MIN_RINGS_PER_BULGE = 4;

/**
 * Верёвка рисуется штатной трубкой Babylon вдоль пути частиц.
 *
 * `CreateTube` с параметром `instance` обновляет уже созданный меш, не пересобирая его с нуля;
 * число точек пути при этом менять нельзя, поэтому массив пути выделен один раз и переиспользуется.
 *
 * Путь сглаживается сплайном Катмулла — Рома: по самим частицам трубка была бы ломаной.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly material: StandardMaterial;
  private readonly texture: DynamicTexture;
  private readonly relief: DynamicTexture;
  private readonly radius: number;
  private readonly bulge: number;
  private readonly pitch: number;

  /**
   * Радиус трубки вдоль пути: витки — это не только текстура, но и настоящая выпуклость.
   * Только текстурой не обойтись: на тонкой трубке мип-фильтрация замыливает мелкий узор,
   * а выпуклость видно при любой фильтрации и на любом расстоянии.
   *
   * Функция создаётся один раз и передаётся в CreateTube каждый кадр: замыканий в кадре не появляется.
   */
  private readonly strandRadius = (_index: number, distance: number): number =>
    this.radius * (1 + this.bulge * Math.sin((distance / this.pitch) * Math.PI * 2));
  private mesh: Mesh;

  private readonly rings: number;
  /** Сглаженный путь: те же объекты каждый кадр, CreateTube читает их на месте. */
  private readonly path: Vector3[];
  private renderedRevision = -1;

  // Scratch-поля: опорные точки сплайна.
  private readonly before = new Vector3();
  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly after = new Vector3();

  public constructor(scene: Scene, rope: Rope) {
    const { thickness, color, specular, specularPower, length, smoothing, tessellation } =
      GameConfig.rope;

    const { strands, twists, strandRelief } = GameConfig.rope;

    this.rope = rope;
    this.rings = (rope.pointCount - 1) * smoothing + 1;
    this.radius = thickness / 2;
    this.bulge = strandRelief * BULGE_SHARE;
    // Выпуклость — геометрия, и её период не может быть короче четырёх колец: иначе синус
    // попадает в алиасинг и вместо витков выходят случайные биения. Текстуру это не ограничивает,
    // у неё витков столько, сколько задано.
    const ringPitch = (length / (this.rings - 1)) * MIN_RINGS_PER_BULGE;
    this.pitch = Math.max(length / twists, ringPitch);

    // Стартовый путь — прямой отрезок: вырожденный путь Babylon построить не сможет.
    this.path = new Array<Vector3>(this.rings);
    const step = length / (this.rings - 1);
    for (let i = 0; i < this.rings; i++) {
      this.path[i] = new Vector3(i * step, 0, 0);
    }

    this.mesh = CreateTube(
      MESH_NAME,
      { path: this.path, radiusFunction: this.strandRadius, tessellation, updatable: true },
      scene,
    );
    this.mesh.isPickable = false;
    this.mesh.isVisible = false;
    // Габариты пересчитываются не каждый кадр — без этого трубку отсекает frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new StandardMaterial("rope-material", scene);
    this.texture = RopeTexture.createDiffuse(scene, color, strands);
    this.relief = RopeTexture.createNormal(scene, strands, strandRelief);
    // У трубки Babylon вдоль пути идёт U, поперёк — V: витьё повторяем по U,
    // а по кругу ровно один раз, иначе узор разойдётся на шве.
    this.texture.uScale = twists;
    this.relief.uScale = twists;
    // Трубка тонкая: по кругу текстура укладывается в считаные пиксели, и обычная
    // мип-фильтрация замыливает заодно узор вдоль верёвки. Анизотропия её удерживает.
    this.texture.anisotropicFilteringLevel = ANISOTROPY;
    this.relief.anisotropicFilteringLevel = ANISOTROPY;
    this.material.diffuseTexture = this.texture;
    this.material.bumpTexture = this.relief;
    this.material.specularColor = specular;
    this.material.specularPower = specularPower;
    this.mesh.material = this.material;
    // Шейдер компилируется заранее: иначе первый показ верёвки стоит просадки кадра.
    this.material.forceCompilation(this.mesh);
    // Материал верёвки после настройки не меняется: снимаем с него проверки грязных флагов.
    this.material.freeze();
  }

  public update(): void {
    if (!this.rope.isActive) {
      this.mesh.isVisible = false;
      return;
    }
    if (this.renderedRevision === this.rope.revision) {
      return;
    }

    this.buildPath();
    // CreateTube внутри выделяет массив и Vector3 на каждое кольцо (tubeBuilder, tubePathArray),
    // поэтому вызываем его только когда верёвка действительно сдвинулась: спящая не стоит ничего.
    this.mesh = CreateTube(MESH_NAME, {
      path: this.path,
      radiusFunction: this.strandRadius,
      instance: this.mesh,
    });
    this.mesh.isVisible = true;
    this.renderedRevision = this.rope.revision;
  }

  /** Сплайн по частицам решателя: кривая проходит через них, но без изломов. */
  private buildPath(): void {
    const smoothing = GameConfig.rope.smoothing;
    const last = this.rope.pointCount - 1;

    for (let segment = 0; segment < last; segment++) {
      // Крайним звеньям соседа нет — берём саму точку, сплайн там просто выпрямляется.
      this.rope.copyPointTo(Math.max(segment - 1, 0), this.before);
      this.rope.copyPointTo(segment, this.start);
      this.rope.copyPointTo(segment + 1, this.end);
      this.rope.copyPointTo(Math.min(segment + 2, last), this.after);

      for (let step = 0; step < smoothing; step++) {
        this.writeSplinePoint(step / smoothing, this.path[segment * smoothing + step]!);
      }
    }

    this.rope.copyPointTo(last, this.path[this.rings - 1]!);
  }

  private writeSplinePoint(t: number, result: Vector3): void {
    const t2 = t * t;
    const t3 = t2 * t;
    const wBefore = -t + 2 * t2 - t3;
    const wStart = 2 - 5 * t2 + 3 * t3;
    const wEnd = t + 4 * t2 - 3 * t3;
    const wAfter = -t2 + t3;

    result.set(
      (this.before.x * wBefore + this.start.x * wStart + this.end.x * wEnd + this.after.x * wAfter) / 2,
      (this.before.y * wBefore + this.start.y * wStart + this.end.y * wEnd + this.after.y * wAfter) / 2,
      (this.before.z * wBefore + this.start.z * wStart + this.end.z * wEnd + this.after.z * wAfter) / 2,
    );
  }

  public dispose(): void {
    this.relief.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
