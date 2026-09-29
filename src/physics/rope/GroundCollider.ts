import { PARTICLE_STRIDE } from "./ParticleBuffer";
import type { ParticleBuffer } from "./ParticleBuffer";
import type { RopeCollider } from "./RopeCollider";

/**
 * Пол y = height. Трение — как в solveGroundCollisions у Мюллера:
 * горизонтальное смещение за подшаг откатывается к прошлой позиции на долю `friction`.
 */
export class GroundCollider implements RopeCollider {
  private readonly surface: number;
  private readonly friction: number;

  public constructor(height: number, radius: number, friction: number) {
    this.surface = height + radius;
    this.friction = friction;
  }

  public prepare(): void {
    // Пол неподвижен — кэшировать нечего.
  }

  public resolve(particles: ParticleBuffer, index: number): void {
    const { position, previous } = particles;
    const x = index * PARTICLE_STRIDE;

    if (position[x + 1]! >= this.surface) {
      return;
    }

    position[x] = position[x]! - (position[x]! - previous[x]!) * this.friction;
    position[x + 2] = position[x + 2]! - (position[x + 2]! - previous[x + 2]!) * this.friction;
    position[x + 1] = this.surface;
  }
}
