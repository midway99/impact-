import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/** Сторона текстуры в пикселях: узор мелкий и повторяется, больше не нужно. */
const SIZE = 128;
const CHANNELS = 4;
const OPAQUE = 255;
/** Насколько канавка между прядями темнее гребня. */
const GROOVE_SHADE = 0.5;

/**
 * Витьё верёвки, нарисованное процедурно: пряди идут по спирали, между ними канавки.
 *
 * Полоса сдвигается вдоль верёвки ровно на целое число прядей за оборот, поэтому узор
 * стыкуется сам с собой и текстуру можно повторять сколько угодно раз.
 *
 * Рисуется один раз при старте: в кадре текстура только читается видеокартой.
 */
export class RopeTexture {
  public static create(scene: Scene, base: Color3, strands: number): DynamicTexture {
    const texture = new DynamicTexture("rope-strands", { width: SIZE, height: SIZE }, scene, true);
    const context = texture.getContext();
    const image = context.getImageData(0, 0, SIZE, SIZE);
    const pixels = image.data;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const shade = RopeTexture.shadeAt(x / SIZE, y / SIZE, strands);
        const at = (y * SIZE + x) * CHANNELS;

        pixels[at] = base.r * shade * OPAQUE;
        pixels[at + 1] = base.g * shade * OPAQUE;
        pixels[at + 2] = base.b * shade * OPAQUE;
        pixels[at + 3] = OPAQUE;
      }
    }

    context.putImageData(image, 0, 0);
    texture.update(false);

    return texture;
  }

  /**
   * Яркость точки узора. Вдоль верёвки фаза уезжает на `strands` полос за оборот —
   * это и даёт наклон пряди; синус превращает полосу в круглый валик с тенью по краям.
   */
  private static shadeAt(u: number, v: number, strands: number): number {
    const phase = (u + v * strands) % 1;
    const round = Math.sin(Math.PI * phase);

    return GROOVE_SHADE + (1 - GROOVE_SHADE) * round * round;
  }
}
