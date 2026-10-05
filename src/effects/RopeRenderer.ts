import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";
import { RopeFrames } from "./RopeFrames";
import type { RopeShape } from "./RopeShape";
import { RopeTexture } from "./RopeTexture";

const AXIS = 3;
const CROSS = 2;
/** Уровень анизотропной фильтрации витья: узор идёт вдоль сильно вытянутой поверхности. */
const ANISOTROPY = 16;
/** Доля выраженности прядей, уходящая в выпуклость модели; остальное — в рельеф теней. */
const BULGE_SHARE = 0.7;
/** Опорных точек на период выпуклости: меньше четырёх — и волна вырождается в биения. */
const MIN_POINTS_PER_BULGE = 4;

/**
 * Верёвка рисуется изгибом готовой модели вдоль кривой, а не построением колец.
 *
 * Модель приходит из `RopeModel` — это единственное место, где её можно подменить
 * на меш от моделлера. Вершины разбираются один раз (`RopeShape`), а в кадре каждая
 * переносится в систему координат той точки кривой, на которую попадает по длине.
 *
 * Топология, развёртка и локальные нормали берутся из модели как есть — поэтому
 * художник волен делать любое сечение и любую детализацию.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly texture: DynamicTexture;
  private readonly relief: DynamicTexture;

  private readonly shape: RopeShape;
  private readonly frames: RopeFrames;
  private readonly points: number;
  private readonly bulge: number;
  private readonly pitch: number;

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  /** Сглаженный путь: те же объекты каждый кадр. */
  private readonly path: readonly Vector3[];
  /** Длина дуги до каждой точки пути — по ней идёт выпуклость прядей. */
  private readonly distances: Float32Array;
  private renderedRevision = -1;
  /** Длина дуги в последней опрошенной точке: заполняется в `sampleAt`. */
  private sampledDistance = 0;

  // Scratch-поля: опорные точки сплайна и оси в текущей вершине.
  private readonly before = new Vector3();
  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly after = new Vector3();
  private readonly centre = new Vector3();
  private readonly tangent = new Vector3();
  private readonly normal = new Vector3();
  private readonly binormal = new Vector3();

  /** Форма приходит готовой: её загрузка асинхронная, а буферы нужны уже в конструкторе. */
  public constructor(scene: Scene, rope: Rope, shape: RopeShape) {
    const { length, smoothing, twists, strandRelief } = GameConfig.rope;

    this.rope = rope;
    this.points = (rope.pointCount - 1) * smoothing + 1;
    this.bulge = strandRelief * BULGE_SHARE;
    // Период выпуклости не короче четырёх опорных точек: иначе синус попадает в алиасинг
    // и вместо витков выходят случайные биения. Текстуру это не ограничивает.
    this.pitch = Math.max(length / twists, (length / (this.points - 1)) * MIN_POINTS_PER_BULGE);

    this.path = RopeRenderer.createPath(this.points, length);
    this.distances = new Float32Array(this.points);
    this.frames = new RopeFrames(this.points);
    this.shape = shape;

    this.positions = new Float32Array(this.shape.vertexCount * AXIS);
    this.normals = new Float32Array(this.shape.vertexCount * AXIS);

    this.mesh = new Mesh("rope", scene);
    this.buildGeometry();
    this.mesh.isPickable = false;
    this.mesh.isVisible = false;
    // Габариты пересчитываются не каждый кадр — без этого верёвку отсекает frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.texture = RopeTexture.createDiffuse(scene, GameConfig.rope.color, GameConfig.rope.strands);
    this.relief = RopeTexture.createNormal(scene, GameConfig.rope.strands, strandRelief);
    this.material = this.createMaterial(scene, twists);
    this.mesh.material = this.material;
  }

  /** Стартовый путь — прямой отрезок: по вырожденному нельзя построить систему координат. */
  private static createPath(points: number, length: number): readonly Vector3[] {
    const path = new Array<Vector3>(points);
    const step = length / (points - 1);

    for (let i = 0; i < points; i++) {
      path[i] = new Vector3(i * step, 0, 0);
    }

    return path;
  }

  private createMaterial(scene: Scene, twists: number): StandardMaterial {
    const { specular, specularPower } = GameConfig.rope;
    const material = new StandardMaterial("rope-material", scene);

    for (const map of [this.texture, this.relief]) {
      // Витьё повторяется вдоль верёвки; поперёк — ровно один раз, иначе узор разойдётся на шве.
      map.uScale = twists;
      // Верёвка тонкая: по кругу текстура укладывается в считаные пиксели, и обычная
      // мип-фильтрация замыливает заодно узор вдоль неё. Анизотропия его удерживает.
      map.anisotropicFilteringLevel = ANISOTROPY;
    }

    material.diffuseTexture = this.texture;
    material.bumpTexture = this.relief;
    material.specularColor = specular;
    material.specularPower = specularPower;
    // Шейдер компилируется заранее: иначе первый показ верёвки стоит просадки кадра.
    material.forceCompilation(this.mesh);
    material.freeze();

    return material;
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
    this.frames.update(this.path);
    this.deform();

    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions, false, false);
    this.mesh.updateVerticesData(VertexBuffer.NormalKind, this.normals, false, false);
    this.mesh.isVisible = true;
    this.renderedRevision = this.rope.revision;
  }

  /** Топология и развёртка берутся из модели и за всю игру не меняются. */
  private buildGeometry(): void {
    const data = new VertexData();

    data.positions = this.positions;
    data.normals = this.normals;
    data.uvs = this.shape.uvs;
    data.indices = this.shape.indices;
    data.applyToMesh(this.mesh, true);
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

    this.rope.copyPointTo(last, this.path[this.points - 1]!);
    this.measureDistances();
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

  private measureDistances(): void {
    this.distances[0] = 0;

    for (let i = 1; i < this.points; i++) {
      this.distances[i] = this.distances[i - 1]! + Vector3.Distance(this.path[i - 1]!, this.path[i]!);
    }
  }

  /** Каждая вершина модели переносится в систему координат своей точки кривой. */
  private deform(): void {
    const { along, cross, normals, vertexCount } = this.shape;
    const last = this.points - 1;

    for (let i = 0; i < vertexCount; i++) {
      this.sampleAt(along[i]! * last);

      const at = i * AXIS;
      const u = cross[i * CROSS]!;
      const v = cross[i * CROSS + 1]!;
      const scale = 1 + this.bulge * Math.sin((this.sampledDistance / this.pitch) * Math.PI * 2);

      this.positions[at] = this.centre.x + (this.normal.x * u + this.binormal.x * v) * scale;
      this.positions[at + 1] = this.centre.y + (this.normal.y * u + this.binormal.y * v) * scale;
      this.positions[at + 2] = this.centre.z + (this.normal.z * u + this.binormal.z * v) * scale;

      // Нормаль модели живёт в её осях: поперёк, вдоль, поперёк — переводим теми же векторами.
      const nx = normals[at]!;
      const ny = normals[at + 1]!;
      const nz = normals[at + 2]!;
      this.normals[at] = this.normal.x * nx + this.tangent.x * ny + this.binormal.x * nz;
      this.normals[at + 1] = this.normal.y * nx + this.tangent.y * ny + this.binormal.y * nz;
      this.normals[at + 2] = this.normal.z * nx + this.tangent.z * ny + this.binormal.z * nz;
    }
  }

  /** Точка и оси кривой на дробной позиции: между соседними опорными точками — линейно. */
  private sampleAt(position: number): void {
    const low = Math.min(Math.floor(position), this.points - 2);
    const high = low + 1;
    const t = position - low;

    Vector3.LerpToRef(this.path[low]!, this.path[high]!, t, this.centre);
    this.sampledDistance = this.distances[low]! + (this.distances[high]! - this.distances[low]!) * t;

    RopeRenderer.lerpAxis(this.frames.tangents, low, high, t, this.tangent);
    RopeRenderer.lerpAxis(this.frames.normals, low, high, t, this.normal);
    RopeRenderer.lerpAxis(this.frames.binormals, low, high, t, this.binormal);
  }

  private static lerpAxis(
    axes: Float32Array,
    low: number,
    high: number,
    t: number,
    result: Vector3,
  ): void {
    const a = low * AXIS;
    const b = high * AXIS;

    result.set(
      axes[a]! + (axes[b]! - axes[a]!) * t,
      axes[a + 1]! + (axes[b + 1]! - axes[a + 1]!) * t,
      axes[a + 2]! + (axes[b + 2]! - axes[a + 2]!) * t,
    );
    result.normalize();
  }

  public dispose(): void {
    this.relief.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
