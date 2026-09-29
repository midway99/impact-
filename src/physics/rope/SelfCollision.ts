import { PARTICLE_STRIDE } from "./ParticleBuffer";
import type { ParticleBuffer } from "./ParticleBuffer";

/** Соседи ближе этого по цепочке держатся звеном и изгибом — разводить их нечем и незачем. */
const CHAIN_NEIGHBOURHOOD = 2;

/**
 * Самопересечение верёвки по схеме Мюллера (15-selfCollision).
 *
 * Список кандидатов строится один раз на кадр, с запасом на путь, который частица
 * физически успевает пройти за кадр; все подшаги разводят уже только эти пары.
 *
 * Хеш-сетки из оригинала здесь нет сознательно: на полусотне частиц её построение
 * дороже честного перебора пар, а выигрывать она начинает с сотен частиц.
 */
export class SelfCollision {
  private readonly distance: number;
  /** Пары кандидатов подряд: i, j, i, j… Выделены заранее на худший случай. */
  private readonly pairs: Int32Array;
  private pairCount = 0;

  public constructor(particleCount: number, distance: number) {
    this.distance = distance;
    this.pairs = new Int32Array(particleCount * (particleCount - 1));
  }

  /** Кандидаты на кадр: пары, которые за кадр вообще способны сойтись ближе `distance`. */
  public prepare(particles: ParticleBuffer, reach: number): void {
    this.pairCount = 0;
    if (this.distance <= 0) {
      return;
    }

    const { position, count } = particles;
    const limit = this.distance + reach;
    const limitSquared = limit * limit;
    let at = 0;

    for (let i = CHAIN_NEIGHBOURHOOD + 1; i < count; i++) {
      const oi = i * PARTICLE_STRIDE;

      for (let j = 0; j < i - CHAIN_NEIGHBOURHOOD; j++) {
        const oj = j * PARTICLE_STRIDE;
        const dx = position[oi]! - position[oj]!;
        const dy = position[oi + 1]! - position[oj + 1]!;
        const dz = position[oi + 2]! - position[oj + 2]!;

        if (dx * dx + dy * dy + dz * dz > limitSquared) {
          continue;
        }

        this.pairs[at++] = i;
        this.pairs[at++] = j;
      }
    }

    this.pairCount = at;
  }

  /** Разводит сошедшиеся пары: каждая частица отходит на свою долю по обратной массе. */
  public resolve(particles: ParticleBuffer): void {
    const { position, inverseMass } = particles;
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

      const oi = i * PARTICLE_STRIDE;
      const oj = j * PARTICLE_STRIDE;
      const dx = position[oi]! - position[oj]!;
      const dy = position[oi + 1]! - position[oj + 1]!;
      const dz = position[oi + 2]! - position[oj + 2]!;
      const distanceSquared = dx * dx + dy * dy + dz * dz;

      if (distanceSquared >= minimumSquared || distanceSquared === 0) {
        continue;
      }

      // То же ограничение расстояния, что у звена, но одностороннее: только раздвигает.
      const distance = Math.sqrt(distanceSquared);
      const s = (minimum - distance) / distance / weight;

      position[oi] = position[oi]! + dx * s * wi;
      position[oi + 1] = position[oi + 1]! + dy * s * wi;
      position[oi + 2] = position[oi + 2]! + dz * s * wi;
      position[oj] = position[oj]! - dx * s * wj;
      position[oj + 1] = position[oj + 1]! - dy * s * wj;
      position[oj + 2] = position[oj + 2]! - dz * s * wj;
    }
  }
}
