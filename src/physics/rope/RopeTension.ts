import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../../core/GameConfig";

/**
 * Рабочая длина верёвки: сколько её сейчас в деле.
 *
 * Пока куб летит, верёвка размотана целиком. Как только он примёрз, длина подтягивается
 * до расстояния до него с небольшим запасом — провисать становится нечему, и рывок идёт
 * на натянутой верёвке. Отойдёт персонаж дальше — длина так же стравится обратно,
 * до полной и не больше.
 *
 * Хранит одно число: длины связей решателя считаются от него, поэтому отсюда управляется
 * и натяжение, и поводок.
 */
export class RopeTension {
  private current = GameConfig.rope.length;
  private attached = false;

  /** Длина верёвки в метрах на этот кадр. */
  public get length(): number {
    return this.current;
  }

  /** Бросок: верёвка снова размотана целиком. */
  public reset(): void {
    this.current = GameConfig.rope.length;
    this.attached = false;
  }

  /**
   * Пересчитывает длину. Возвращает `true` в тот единственный кадр, когда верёвка
   * только что зацепилась: в этот момент её мало укоротить, её надо ещё и выпрямить.
   */
  public update(stepSeconds: number, hand: Vector3, attachment: Vector3 | null): boolean {
    const { length, slack, reelSpeed } = GameConfig.rope;
    const target =
      attachment === null
        ? length
        : Math.min(length, Vector3.Distance(hand, attachment) * (1 + slack));
    // Касание — событие, а не процесс: персонаж прилетает быстрее, чем верёвка успела бы
    // выбрать метры запаса, и постепенная подтяжка оставила бы весь рывок на провисе.
    const caught = attachment !== null && !this.attached;

    if (caught) {
      this.current = target;
    } else {
      const step = reelSpeed * stepSeconds;
      this.current += Math.max(-step, Math.min(step, target - this.current));
    }

    this.attached = attachment !== null;

    return caught;
  }
}
