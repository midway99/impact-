import type { ParticleBuffer } from "./ParticleBuffer";

/** Препятствие для частиц верёвки. */
export interface RopeCollider {
  /** Раз в кадр перед подшагами: обновить кэш (матрицы и т.п.). */
  prepare(): void;
  /** Вытолкнуть частицу `index` наружу, если она внутри. */
  resolve(particles: ParticleBuffer, index: number): void;
}
