import type { RopeCollider } from "./RopeCollider";
import type { RopePath } from "./RopePath";

/**
 * Пол y = height. Трение — как в `solveGroundCollisions` у Мюллера:
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

  public resolve(path: RopePath, index: number): void {
    const point = path.points[index]!;

    if (point.y >= this.surface) {
      return;
    }

    const previous = path.previous[index]!;
    point.x -= (point.x - previous.x) * this.friction;
    point.z -= (point.z - previous.z) * this.friction;
    point.y = this.surface;
  }
}
