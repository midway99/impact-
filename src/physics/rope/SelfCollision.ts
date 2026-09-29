import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { RopePath } from "./RopePath";

/** Точки ближе этого по цепочке держатся звеном и изгибом — разводить их нечем и незачем. */
const CHAIN_NEIGHBOURHOOD = 2;

/**
 * Самопересечение верёвки по схеме Мюллера (15-selfCollision).
 *
 * Список кандидатов строится один раз на кадр, с запасом на путь, который точка
 * физически успевает пройти за кадр; все подшаги разводят уже только эти пары.
 *
 * Хеш-сетки из оригинала здесь нет сознательно: на нескольких десятках точек её
 * построение дороже честного перебора пар, а выигрывать она начинает с сотен.
 */
export class SelfCollision {
  private readonly distance: number;
  /** Пары кандидатов подряд: i, j, i, j… Выделены заранее на худший случай. */
  private readonly pairs: Int32Array;
  private pairCount = 0;

  private readonly delta = new Vector3();

  public constructor(pointCount: number, distance: number) {
    this.distance = distance;
    this.pairs = new Int32Array(pointCount * (pointCount - 1));
  }

  /** Кандидаты на кадр: пары, которые за кадр вообще способны сойтись ближе `distance`. */
  public prepare(path: RopePath, reach: number): void {
    this.pairCount = 0;
    if (this.distance <= 0) {
      return;
    }

    const { points, count } = path;
    const limit = this.distance + reach;
    const limitSquared = limit * limit;
    let at = 0;

    for (let i = CHAIN_NEIGHBOURHOOD + 1; i < count; i++) {
      const point = points[i]!;

      for (let j = 0; j < i - CHAIN_NEIGHBOURHOOD; j++) {
        if (Vector3.DistanceSquared(point, points[j]!) > limitSquared) {
          continue;
        }

        this.pairs[at++] = i;
        this.pairs[at++] = j;
      }
    }

    this.pairCount = at;
  }

  /** Разводит сошедшиеся пары: каждая точка отходит на свою долю по обратной массе. */
  public resolve(path: RopePath): void {
    const { points, inverseMass } = path;
    const minimum = this.distance;
    const minimumSquared = minimum * minimum;

    for (let p = 0; p < this.pairCount; p += 2) {
      const i = this.pairs[p]!;
      const j = this.pairs[p + 1]!;
      const wi = inverseMass[i]!;
      const wj = inverseMass[j]!;
      const weight = wi + wj;
      if (weight === 0) {
        continue;
      }

      const a = points[i]!;
      const b = points[j]!;
      a.subtractToRef(b, this.delta);

      const distanceSquared = this.delta.lengthSquared();
      if (distanceSquared >= minimumSquared || distanceSquared === 0) {
        continue;
      }

      // То же ограничение расстояния, что у звена, но одностороннее: только раздвигает.
      const distance = Math.sqrt(distanceSquared);
      const s = (minimum - distance) / distance / weight;

      this.delta.scaleAndAddToRef(s * wi, a);
      this.delta.scaleAndAddToRef(-s * wj, b);
    }
  }
}
