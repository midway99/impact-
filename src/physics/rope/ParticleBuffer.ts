import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Компонент на частицу: x, y, z подряд. */
export const PARTICLE_STRIDE = 3;

/**
 * Частицы в плоских массивах: ни одного объекта на частицу, решатель работает прямо по индексам.
 * `inverseMass = 0` — частица закреплена (её двигают снаружи).
 * Индексы в пределах массивов по построению, поэтому в циклах по ним используется `!`.
 */
export class ParticleBuffer {
  public readonly count: number;
  public readonly position: Float32Array;
  public readonly previous: Float32Array;
  public readonly velocity: Float32Array;
  public readonly inverseMass: Float32Array;

  public constructor(count: number) {
    this.count = count;
    this.position = new Float32Array(count * PARTICLE_STRIDE);
    this.previous = new Float32Array(count * PARTICLE_STRIDE);
    this.velocity = new Float32Array(count * PARTICLE_STRIDE);
    this.inverseMass = new Float32Array(count);
  }

  public readToRef(array: Float32Array, index: number, result: Vector3): Vector3 {
    const offset = index * PARTICLE_STRIDE;

    return result.set(array[offset]!, array[offset + 1]!, array[offset + 2]!);
  }

  public write(array: Float32Array, index: number, value: Vector3): void {
    const offset = index * PARTICLE_STRIDE;

    array[offset] = value.x;
    array[offset + 1] = value.y;
    array[offset + 2] = value.z;
  }
}
