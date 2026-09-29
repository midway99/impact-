import { Buffer, VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";

const AXIS = 3;
/** Позиция и нормаль лежат в одной вершине подряд: x y z nx ny nz. */
const VERTEX_STRIDE = 6;
const NORMAL_OFFSET = 3;

/**
 * Верёвка рисуется трубкой с постоянной топологией: кольца вершин вдоль пути.
 * Индексы считаются один раз, в кадре переписываются только координаты и нормали —
 * ни аллокаций, ни пересборки геометрии.
 *
 * Позиции и нормали лежат в одном чередующемся буфере: на кадр приходится одна
 * загрузка в видеопамять вместо двух, то есть вдвое меньше точек синхронизации с GPU.
 *
 * Путь сглаживается сплайном Катмулла — Рома: по самим частицам трубка была бы ломаной.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly buffer: Buffer;

  private readonly rings: number;
  private readonly sides: number;
  /** Чередующиеся вершины: та же память каждый кадр. */
  private readonly vertices: Float32Array;
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
    const { thickness, color, length, smoothing, tessellation } = GameConfig.rope;

    this.rope = rope;
    this.rings = (rope.pointCount - 1) * smoothing + 1;
    this.sides = tessellation;

    const path = new Array<Vector3>(this.rings);
    const step = length / (this.rings - 1);
    for (let i = 0; i < this.rings; i++) {
      path[i] = new Vector3(i * step, 0, 0);
    }
    this.path = path;

    this.cosines = new Float32Array(this.sides);
    this.sines = new Float32Array(this.sides);
    for (let side = 0; side < this.sides; side++) {
      const angle = (side / this.sides) * Math.PI * 2;
      this.cosines[side] = Math.cos(angle) * (thickness / 2);
      this.sines[side] = Math.sin(angle) * (thickness / 2);
    }

    this.vertices = new Float32Array(this.rings * this.sides * VERTEX_STRIDE);

    this.mesh = new Mesh("rope", scene);
    this.buffer = new Buffer(scene.getEngine(), this.vertices, true, VERTEX_STRIDE);
    this.buildGeometry();
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

    this.buildPath();
    this.writeRings();

    this.buffer.update(this.vertices);
    this.mesh.isVisible = true;
    this.renderedRevision = this.rope.revision;
  }

  /** Треугольники между соседними кольцами. Топология постоянна — считается один раз. */
  private buildGeometry(): void {
    const indices = new Array<number>((this.rings - 1) * this.sides * 6);
    let at = 0;

    for (let ring = 0; ring < this.rings - 1; ring++) {
      for (let side = 0; side < this.sides; side++) {
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

    // Два вида на одну и ту же память: позиции с начала вершины, нормали со смещения.
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer(VertexBuffer.PositionKind, 0, AXIS));
    this.mesh.setVerticesBuffer(this.buffer.createVertexBuffer(VertexBuffer.NormalKind, NORMAL_OFFSET, AXIS));
    this.mesh.setIndices(indices, this.rings * this.sides);
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

  private writeRings(): void {
    for (let ring = 0; ring < this.rings; ring++) {
      this.updateFrame(ring);
      this.writeRing(ring);
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

  private writeRing(ring: number): void {
    const centre = this.path[ring]!;
    const base = ring * this.sides * VERTEX_STRIDE;

    for (let side = 0; side < this.sides; side++) {
      const cos = this.cosines[side]!;
      const sin = this.sines[side]!;
      const at = base + side * VERTEX_STRIDE;

      this.radial.set(
        this.normal.x * cos + this.binormal.x * sin,
        this.normal.y * cos + this.binormal.y * sin,
        this.normal.z * cos + this.binormal.z * sin,
      );

      this.vertices[at] = centre.x + this.radial.x;
      this.vertices[at + 1] = centre.y + this.radial.y;
      this.vertices[at + 2] = centre.z + this.radial.z;

      // Нормаль смотрит наружу от оси трубки — отсюда мягкое затенение вдоль верёвки.
      const inverseRadius = 1 / this.radial.length();
      this.vertices[at + NORMAL_OFFSET] = this.radial.x * inverseRadius;
      this.vertices[at + NORMAL_OFFSET + 1] = this.radial.y * inverseRadius;
      this.vertices[at + NORMAL_OFFSET + 2] = this.radial.z * inverseRadius;
    }
  }

  public dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
    // Буфер создан вручную, меш им не владеет и сам не освободит.
    this.buffer.dispose();
  }
}
