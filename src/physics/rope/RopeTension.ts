import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../../core/GameConfig";

/**
 * Рабочая длина верёвки: сколько её сейчас в деле.
 *
 * Потолок задаёт бросок: слабый стравливает несколько метров, полный заряд — всю верёвку.
 * Пока куб летит, размотано ровно столько. Как только он примёрз, длина подтягивается
 * до расстояния до него с небольшим запасом — провисать становится нечему, и рывок идёт
 * на натянутой верёвке. Отойдёт персонаж дальше — длина так же стравится обратно,
 * до полной и не больше.
 *
 * Хранит одно число: длины связей решателя считаются от него, поэтому отсюда управляется
 * и натяжение, и поводок.
 */
export class RopeTension {
  private current = GameConfig.rope.length;
  /** Сколько верёвки стравлено на этот бросок: потолок, выше которого длина не отходит. */
  private payout = GameConfig.rope.length;
  private attached = false;

  /** Длина верёвки в метрах на этот кадр. */
  public get length(): number {
    return this.current;
  }

  /** Бросок: верёвка размотана ровно на столько, сколько стравил заряд. */
  public reset(payout: number): void {
    this.payout = payout;
    this.current = payout;
    this.attached = false;
  }

  /**
   * Пересчитывает длину. Возвращает `true` в тот единственный кадр, когда верёвка
   * только что зацепилась: в этот момент её мало укоротить, её надо ещё и выпрямить.
   */
  public update(stepSeconds: number, hand: Vector3, attachment: Vector3 | null): boolean {
    const { slack, reelSpeed } = GameConfig.rope;
    const target =
      attachment === null
        ? this.payout
        : Math.min(this.payout, Vector3.Distance(hand, attachment) * (1 + slack));
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
