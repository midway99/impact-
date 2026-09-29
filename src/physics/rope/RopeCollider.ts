import type { RopePath } from "./RopePath";

/** Препятствие для верёвки. Работает по позициям: скорость решатель выведет сам. */
export interface RopeCollider {
  /** Вызывается раз в кадр: сюда прячется всё, что не меняется между подшагами. */
  prepare(): void;
  /** Возвращает точку пути наружу препятствия, если она внутрь попала. */
  resolve(path: RopePath, index: number): void;
}
