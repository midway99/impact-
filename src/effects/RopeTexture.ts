import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/** Сторона текстуры в пикселях: узор мелкий и повторяется, больше не нужно. */
const SIZE = 128;
const CHANNELS = 4;
const OPAQUE = 255;
/** Насколько канавка между прядями темнее гребня. */
const GROOVE_SHADE = 0.45;

/**
 * Витьё верёвки, нарисованное процедурно: пряди идут по спирали, между ними канавки.
 * Файлов-текстур в проекте нет — обе карты строятся кодом один раз при старте.
 *
 * Полоса сдвигается вдоль верёвки ровно на целое число прядей за оборот, поэтому узор
 * стыкуется сам с собой и текстуру можно повторять сколько угодно раз.
 *
 * Карт две: цветом задаётся собственная тень канавки, нормалями — рельеф. Одного цвета мало:
 * плоские полосы видно только в лоб, а рельеф ловит свет под любым углом.
 */
export class RopeTexture {
  /** Цвет: гребень пряди светлее, канавка темнее. */
  public static createDiffuse(scene: Scene, base: Color3, strands: number): DynamicTexture {
    return RopeTexture.paint(scene, "rope-strands", strands, (phase, pixels, at) => {
      const round = Math.sin(Math.PI * phase);
      const shade = GROOVE_SHADE + (1 - GROOVE_SHADE) * round * round;

      pixels[at] = base.r * shade * OPAQUE;
      pixels[at + 1] = base.g * shade * OPAQUE;
      pixels[at + 2] = base.b * shade * OPAQUE;
    });
  }

  /**
   * Рельеф в касательном пространстве. Высота пряди — тот же синус, нормаль — его наклон:
   * n = normalize(−dh/du, −dh/dv, 1). Вдоль витья склон в `strands` раз круче, чем поперёк.
   */
  public static createNormal(scene: Scene, strands: number, relief: number): DynamicTexture {
    return RopeTexture.paint(scene, "rope-strands-normal", strands, (phase, pixels, at) => {
      const slope = Math.cos(Math.PI * phase) * Math.PI * relief;
      const x = -slope;
      const y = -slope * strands;
      const inverse = 1 / Math.sqrt(x * x + y * y + 1);

      pixels[at] = (x * inverse * 0.5 + 0.5) * OPAQUE;
      pixels[at + 1] = (y * inverse * 0.5 + 0.5) * OPAQUE;
      pixels[at + 2] = (inverse * 0.5 + 0.5) * OPAQUE;
    });
  }

  /** Общий обход пикселей: фаза узора считается одинаково для обеих карт. */
  private static paint(
    scene: Scene,
    name: string,
    strands: number,
    write: (phase: number, pixels: Uint8ClampedArray, at: number) => void,
  ): DynamicTexture {
    const texture = new DynamicTexture(name, { width: SIZE, height: SIZE }, scene, true);
    const context = texture.getContext();
    const image = context.getImageData(0, 0, SIZE, SIZE);
    const pixels = image.data;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const at = (y * SIZE + x) * CHANNELS;

        write((x / SIZE + (y / SIZE) * strands) % 1, pixels, at);
        pixels[at + 3] = OPAQUE;
      }
    }

    context.putImageData(image, 0, 0);
    texture.update(false);

    return texture;
  }
}
