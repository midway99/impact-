import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { IndicesArray } from "@babylonjs/core/types";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

const AXIS = 3;
const CROSS = 2;

/** Оси модели: вдоль какой она вытянута и какие две остаются сечением. */
interface ModelAxes {
  readonly along: number;
  readonly cross: number;
  readonly third: number;
  readonly min: number;
  readonly size: number;
}

/**
 * Модель верёвки, разобранная на то, что нужно для изгиба вдоль кривой.
 *
 * Сюда отдаётся любой меш, вытянутый вдоль одной оси: хоть построенный кодом, хоть
 * привезённый моделлером из Blender. Каждая вершина раскладывается на «как далеко вдоль
 * верёвки» и «насколько в сторону от оси»; изгиб потом подставляет вместо оси кривую.
 *
 * Ось длины определяется по самой модели, поэтому её ориентация в редакторе роли не играет.
 * Топология, развёртка и нормали берутся как есть — сечение и детализация целиком за моделлером.
 *
 * Разбор делается один раз при старте: в кадре эти массивы только читаются.
 */
export class RopeShape {
  public readonly vertexCount: number;
  /** Доля длины модели: 0 у начала, 1 у конца. */
  public readonly along: Float32Array;
  /** Смещение вершины от оси модели: два числа на вершину. */
  public readonly cross: Float32Array;
  /** Нормаль в осях модели: поперёк, вдоль, поперёк. */
  public readonly normals: Float32Array;
  public readonly uvs: Float32Array;
  public readonly indices: IndicesArray;

  private constructor(
    along: Float32Array,
    cross: Float32Array,
    normals: Float32Array,
    uvs: Float32Array,
    indices: IndicesArray,
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
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    const indices = mesh.getIndices();

    if (!positions || !normals || !indices) {
      throw new Error(`Модель верёвки ${mesh.name} без позиций, нормалей или индексов`);
    }

    const axes = RopeShape.measureAxes(positions);
    const count = positions.length / AXIS;
    const along = new Float32Array(count);
    const cross = new Float32Array(count * CROSS);
    const localNormals = new Float32Array(count * AXIS);

    for (let i = 0; i < count; i++) {
      const at = i * AXIS;

      along[i] = (positions[at + axes.along]! - axes.min) / axes.size;
      cross[i * CROSS] = positions[at + axes.cross]!;
      cross[i * CROSS + 1] = positions[at + axes.third]!;

      localNormals[at] = normals[at + axes.cross]!;
      localNormals[at + 1] = normals[at + axes.along]!;
      localNormals[at + 2] = normals[at + axes.third]!;
    }

    return new RopeShape(
      along,
      cross,
      localNormals,
      uvs ? Float32Array.from(uvs) : new Float32Array(count * CROSS),
      indices,
    );
  }

  /** Самая длинная сторона модели — вдоль верёвки, остальные две образуют сечение. */
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
}
