import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

const AXIS = 3;
const CROSS = 2;
const UV_STRIDE = 2;
/** Вершин в ряду после отбора: только два края полотна. */
const EDGES = 2;
/** Точность, с которой вершины считаются лежащими в одном ряду поперёк полотна. */
const ROW_EPSILON = 1e-4;

/** Оси модели: вдоль какой она вытянута, какая идёт поперёк, какая остаётся толщиной. */
interface ModelAxes {
  readonly along: number;
  readonly cross: number;
  readonly third: number;
  readonly min: number;
  readonly size: number;
}

/**
 * Модель верёвки, приведённая к ленте: от полотна берутся только две крайние линии вершин.
 *
 * Художник отдаёт плоское полотно с густой сеткой — внутренние вершины верёвке не нужны,
 * форму задаёт решатель. Поэтому в каждом ряду поперёк остаются крайняя левая и крайняя
 * правая вершина, а треугольники пересобираются полосой между соседними рядами.
 *
 * Оси определяются по самой модели: вдоль — там, где она длиннее всего. Благодаря этому
 * ориентация полотна в редакторе значения не имеет.
 *
 * Разбор делается один раз при старте: в кадре эти массивы только читаются.
 */
export class RopeShape {
  public readonly vertexCount: number;
  /** Доля длины модели, 0 у начала и 1 у конца. */
  public readonly along: Float32Array;
  /** Смещение вершины от оси: поперёк полотна и по его толщине. */
  public readonly cross: Float32Array;
  /** Нормаль в осях модели: поперёк, вдоль, толщина. */
  public readonly normals: Float32Array;
  public readonly uvs: Float32Array;
  public readonly indices: number[];

  private constructor(
    along: Float32Array,
    cross: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    indices: number[],
  ) {
    this.vertexCount = along.length;
    this.along = along;
    this.cross = cross;
    this.normals = normals;
    this.uvs = uvs;
    this.indices = indices;
  }

  public static fromMesh(mesh: Mesh): RopeShape {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);

    if (!positions || !normals) {
      throw new Error(`Модель верёвки ${mesh.name} без позиций или нормалей`);
    }

    const axes = RopeShape.measureAxes(positions);
    const rows = RopeShape.collectEdges(positions, axes);

    return RopeShape.buildRibbon(positions, normals, axes, rows);
  }

  /** Самая длинная сторона модели — вдоль верёвки, вторая по длине — поперёк полотна. */
  private static measureAxes(positions: ArrayLike<number>): ModelAxes {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < positions.length; i++) {
      const axis = i % AXIS;
      const value = positions[i]!;
      if (value < min[axis]!) {
        min[axis] = value;
      }
      if (value > max[axis]!) {
        max[axis] = value;
      }
    }

    const spans = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
    const order = [0, 1, 2].sort((a, b) => spans[b]! - spans[a]!);
    const along = order[0]!;

    if (spans[along]! <= 0) {
      throw new Error("Модель верёвки вырождена: нет направления длины");
    }

    return { along, cross: order[1]!, third: order[2]!, min: min[along]!, size: spans[along]! };
  }

  /**
   * По одной паре вершин на ряд: крайняя и крайняя с другой стороны.
   * Ряды определяются по положению вдоль модели, с допуском на неточность сетки.
   */
  private static collectEdges(positions: ArrayLike<number>, axes: ModelAxes): number[][] {
    const rows = new Map<number, number[]>();
    const count = positions.length / AXIS;

    for (let i = 0; i < count; i++) {
      const at = i * AXIS;
      const key = Math.round(((positions[at + axes.along]! - axes.min) / axes.size) / ROW_EPSILON);
      const row = rows.get(key);
      const side = positions[at + axes.cross]!;

      if (!row) {
        rows.set(key, [i, i]);
        continue;
      }

      if (side < positions[row[0]! * AXIS + axes.cross]!) {
        row[0] = i;
      }
      if (side > positions[row[1]! * AXIS + axes.cross]!) {
        row[1] = i;
      }
    }

    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]!);
  }

  /** Полоса треугольников по отобранным краям: два треугольника между соседними рядами. */
  private static buildRibbon(
    positions: ArrayLike<number>,
    normals: ArrayLike<number>,
    axes: ModelAxes,
    rows: readonly number[][],
  ): RopeShape {
    const count = rows.length * EDGES;
    const along = new Float32Array(count);
    const cross = new Float32Array(count * CROSS);
    const vertexNormals = new Float32Array(count * AXIS);
    const uvs = new Float32Array(count * UV_STRIDE);
    const indices: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      for (let edge = 0; edge < EDGES; edge++) {
        const source = rows[row]![edge]! * AXIS;
        const target = row * EDGES + edge;

        along[target] = (positions[source + axes.along]! - axes.min) / axes.size;
        cross[target * CROSS] = positions[source + axes.cross]!;
        cross[target * CROSS + 1] = positions[source + axes.third]!;

        vertexNormals[target * AXIS] = normals[source + axes.cross]!;
        vertexNormals[target * AXIS + 1] = normals[source + axes.along]!;
        vertexNormals[target * AXIS + 2] = normals[source + axes.third]!;

        uvs[target * UV_STRIDE] = along[target]!;
        uvs[target * UV_STRIDE + 1] = edge;
      }

      if (row > 0) {
        const a = (row - 1) * EDGES;
        indices.push(a, a + 1, a + EDGES, a + 1, a + EDGES + 1, a + EDGES);
      }
    }

    return new RopeShape(along, cross, vertexNormals, uvs, indices);
  }
}
