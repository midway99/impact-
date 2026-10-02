import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";
import { RopeTexture } from "./RopeTexture";

const AXIS = 3;
const UV_STRIDE = 2;
/** Индексов на одну ячейку сетки трубки: два треугольника. */
const INDICES_PER_CELL = 6;
/** Уровень анизотропной фильтрации витья: узор идёт вдоль сильно вытянутой поверхности. */
const ANISOTROPY = 16;
/** Доля выраженности прядей, уходящая в выпуклость трубки; остальное — в рельеф теней. */
const BULGE_SHARE = 0.7;
/** Колец на период выпуклости: меньше четырёх — и волна вырождается в биения. */
const MIN_RINGS_PER_BULGE = 4;

/**
 * Верёвка собирается вершинами: кольца вдоль пути, между кольцами — полосы треугольников.
 *
 * Топология постоянна, поэтому индексы и развёртка считаются один раз при старте, а в кадре
 * переписываются только координаты и нормали в уже выделенных массивах — ни аллокаций,
 * ни пересборки геометрии.
 *
 * Путь сглаживается сплайном Катмулла — Рома: по самим частицам трубка была бы ломаной.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly texture: DynamicTexture;
  private readonly relief: DynamicTexture;

  private readonly rings: number;
  private readonly sides: number;
  private readonly radius: number;
  private readonly bulge: number;
  private readonly pitch: number;

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;
  /** Сглаженный путь: те же объекты каждый кадр. */
  private readonly path: readonly Vector3[];
  /** Смещения вершин сечения — считаются один раз. */
  private readonly cosines: Float32Array;
  private readonly sines: Float32Array;
  private renderedRevision = -1;

  // Scratch-поля: опорные точки сплайна и система координат вдоль кривой.
  private readonly before = new Vector3();
  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly after = new Vector3();
  private readonly tangent = new Vector3();
  private readonly normal = new Vector3();
  private readonly binormal = new Vector3();
  private readonly radial = new Vector3();

  public constructor(scene: Scene, rope: Rope) {
    const { thickness, length, smoothing, tessellation, twists, strandRelief } = GameConfig.rope;

    this.rope = rope;
    this.rings = (rope.pointCount - 1) * smoothing + 1;
    this.sides = tessellation;
    this.radius = thickness / 2;
    this.bulge = strandRelief * BULGE_SHARE;
    // Период выпуклости не короче четырёх колец: иначе синус попадает в алиасинг
    // и вместо витков выходят случайные биения. Текстуру это не ограничивает.
    this.pitch = Math.max(length / twists, (length / (this.rings - 1)) * MIN_RINGS_PER_BULGE);

    this.path = RopeRenderer.createPath(this.rings, length);
    this.cosines = new Float32Array(this.sides);
    this.sines = new Float32Array(this.sides);
    for (let side = 0; side < this.sides; side++) {
      const angle = (side / this.sides) * Math.PI * 2;
      this.cosines[side] = Math.cos(angle);
      this.sines[side] = Math.sin(angle);
    }

    const vertices = this.rings * this.sides;
    this.positions = new Float32Array(vertices * AXIS);
    this.normals = new Float32Array(vertices * AXIS);

    this.mesh = new Mesh("rope", scene);
    this.buildGeometry();
    this.mesh.isPickable = false;
    this.mesh.isVisible = false;
    // Габариты пересчитываются не каждый кадр — без этого трубку отсекает frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.texture = RopeTexture.createDiffuse(scene, GameConfig.rope.color, GameConfig.rope.strands);
    this.relief = RopeTexture.createNormal(scene, GameConfig.rope.strands, strandRelief);
    this.material = this.createMaterial(scene, twists);
    this.mesh.material = this.material;
  }

  /** Стартовый путь — прямой отрезок: по вырожденному нельзя построить систему координат. */
  private static createPath(rings: number, length: number): readonly Vector3[] {
    const path = new Array<Vector3>(rings);
    const step = length / (rings - 1);

    for (let i = 0; i < rings; i++) {
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
      // Трубка тонкая: по кругу текстура укладывается в считаные пиксели, и обычная
      // мип-фильтрация замыливает заодно узор вдоль верёвки. Анизотропия её удерживает.
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
    this.writeRings();

    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions, false, false);
    this.mesh.updateVerticesData(VertexBuffer.NormalKind, this.normals, false, false);
    this.mesh.isVisible = true;
    this.renderedRevision = this.rope.revision;
  }

  /**
   * Постоянная часть геометрии: треугольники между соседними кольцами и развёртка.
   * От движения верёвки не зависит ни то ни другое, поэтому считается один раз.
   */
  private buildGeometry(): void {
    const indices = new Array<number>((this.rings - 1) * this.sides * INDICES_PER_CELL);
    const uvs = new Float32Array(this.rings * this.sides * UV_STRIDE);
    let at = 0;

    for (let ring = 0; ring < this.rings; ring++) {
      for (let side = 0; side < this.sides; side++) {
        const uv = (ring * this.sides + side) * UV_STRIDE;
        uvs[uv] = ring / (this.rings - 1);
        uvs[uv + 1] = side / this.sides;

        if (ring === this.rings - 1) {
          continue;
        }

        const next = (side + 1) % this.sides;
        const a = ring * this.sides + side;
        const b = ring * this.sides + next;
        const c = (ring + 1) * this.sides + side;
        const d = (ring + 1) * this.sides + next;

        indices[at++] = a;
        indices[at++] = c;
        indices[at++] = b;
        indices[at++] = b;
        indices[at++] = c;
        indices[at++] = d;
      }
    }

    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.uvs = uvs;
    data.indices = indices;
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

  /** Радиус кольца: витки — не только текстура, но и настоящая выпуклость вдоль дуги. */
  private ringRadius(distance: number): number {
    return this.radius * (1 + this.bulge * Math.sin((distance / this.pitch) * Math.PI * 2));
  }

  private writeRings(): void {
    let distance = 0;

    for (let ring = 0; ring < this.rings; ring++) {
      if (ring > 0) {
        distance += Vector3.Distance(this.path[ring - 1]!, this.path[ring]!);
      }

      this.updateFrame(ring);
      this.writeRing(ring, this.ringRadius(distance));
    }
  }

  /**
   * Система координат кольца. Нормаль переносится с предыдущего кольца и лишь
   * распрямляется поперёк нового направления — иначе трубку перекручивает на изгибах.
   */
  private updateFrame(ring: number): void {
    const current = this.path[ring]!;
    const neighbour = ring < this.rings - 1 ? this.path[ring + 1]! : this.path[ring - 1]!;

    neighbour.subtractToRef(current, this.tangent);
    if (ring === this.rings - 1) {
      this.tangent.scaleInPlace(-1);
    }
    if (this.tangent.lengthSquared() < 1e-12) {
      this.tangent.set(0, 0, 1);
    }
    this.tangent.normalize();

    if (ring === 0) {
      // Первое кольцо: любая ось, не совпадающая с направлением.
      const upright = Math.abs(this.tangent.y) < 0.9;
      this.normal.set(upright ? 0 : 1, upright ? 1 : 0, 0);
    }

    this.tangent.scaleAndAddToRef(-Vector3.Dot(this.normal, this.tangent), this.normal);
    if (this.normal.lengthSquared() < 1e-12) {
      this.normal.set(this.tangent.y, -this.tangent.x, 0);
    }
    this.normal.normalize();
    Vector3.CrossToRef(this.tangent, this.normal, this.binormal);
  }

  private writeRing(ring: number, radius: number): void {
    const centre = this.path[ring]!;
    const base = ring * this.sides * AXIS;

    for (let side = 0; side < this.sides; side++) {
      const cos = this.cosines[side]!;
      const sin = this.sines[side]!;
      const at = base + side * AXIS;

      this.radial.set(
        this.normal.x * cos + this.binormal.x * sin,
        this.normal.y * cos + this.binormal.y * sin,
        this.normal.z * cos + this.binormal.z * sin,
      );

      this.positions[at] = centre.x + this.radial.x * radius;
      this.positions[at + 1] = centre.y + this.radial.y * radius;
      this.positions[at + 2] = centre.z + this.radial.z * radius;

      // Радиальный вектор единичный по построению: нормаль смотрит наружу от оси трубки.
      this.normals[at] = this.radial.x;
      this.normals[at + 1] = this.radial.y;
      this.normals[at + 2] = this.radial.z;
    }
  }

  public dispose(): void {
    this.relief.dispose();
    this.texture.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
