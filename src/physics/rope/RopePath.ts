import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * Состояние верёвки: точки её пути и то, что нужно решателю, чтобы их двигать.
 *
 * Отдельных частиц нет — решатель работает прямо по точкам пути, а тот же массив
 * `points` уходит в `CreateTube` как путь трубки. Так же устроен оригинал Мюллера:
 * там массив позиций одновременно является вершинным буфером сцены.
 *
 * Векторы создаются один раз и дальше только переписываются на месте.
 */
export class RopePath {
  public readonly count: number;
  /** Путь трубки; его же двигает решатель. */
  public readonly points: Vector3[];
  /** Положение точки до текущего подшага: из него выводится скорость. */
  public readonly previous: Vector3[];
  public readonly velocity: Vector3[];
  /** 0 — точка закреплена снаружи (рука, примёрзший куб) и решателю не подчиняется. */
  public readonly inverseMass: Float32Array;

  public constructor(count: number) {
    this.count = count;
    this.points = RopePath.createVectors(count);
    this.previous = RopePath.createVectors(count);
    this.velocity = RopePath.createVectors(count);
    this.inverseMass = new Float32Array(count);
  }

  private static createVectors(count: number): Vector3[] {
    const vectors = new Array<Vector3>(count);

    for (let i = 0; i < count; i++) {
      vectors[i] = new Vector3();
    }

    return vectors;
  }
}
