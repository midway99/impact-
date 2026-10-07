
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../core/GameConfig";
import type { ImpactFreezer } from "../physics/ImpactFreezer";
import type { Player } from "./Player";
import type { Rope } from "./Rope";

/** Состояние рывка. Отдельный тип, чтобы не заводить пару перекрывающихся флагов. */
export enum GrappleState {
  /** Цепляться не за что: броска не было или куб ещё летит. */
  Idle,
  /** Верёвка тянет персонажа к месту удара. */
  Pulling,
  /** Долетели; пока верёвка держится за то же место, второй раз не тянем. */
  Arrived,
}

/**
 * Рывок на верёвке: как только брошенный куб примёрз к стене, персонажа тянет к этому месту.
 *
 * Пока тянет — ввод в движении не участвует и гравитация не действует: скорость тела
 * задаётся целиком, каждый кадр заново. Иначе полёт и ходьба спорили бы за одну скорость.
 */
export class Grapple {
  private readonly player: Player;
  private readonly rope: Rope;
  private readonly impacts: ImpactFreezer;
  private readonly direction = new Vector3();

  private state = GrappleState.Idle;
  /** Подбрасывать ли на этом зацепе: решается один раз, когда рывок начинается. */
  private lifting = false;

  public constructor(player: Player, rope: Rope, impacts: ImpactFreezer) {
    this.player = player;
    this.rope = rope;
    this.impacts = impacts;
  }

  /**
   * Тянет персонажа, если есть за что, и отдаёт состояние рывка:
   * `Pulling` — этим кадром управляет верёвка, а не игрок; `Arrived` — рывок закончен.
   */
  public update(): GrappleState {
    const attachment = this.rope.attachment;

    // Новый бросок обнуляет рывок сам: летящий куб ещё не крепление.
    if (!attachment) {
      this.state = GrappleState.Idle;

      return this.state;
    }

    if (this.state === GrappleState.Arrived) {
      return this.state;
    }

    attachment.subtractToRef(this.player.position, this.direction);
    const distance = this.direction.length();

    if (distance <= GameConfig.grapple.arriveDistance) {
      this.state = GrappleState.Arrived;

      return this.state;
    }

    // Один раз на зацеп: крюк примёрз, выше него уже ничего не изменится.
    if (this.state !== GrappleState.Pulling) {
      this.lifting = this.isOnLedge(attachment);
    }
    this.state = GrappleState.Pulling;

    // На кромке целимся выше крюка. Добавка постоянная, а расстояние убывает — значит чем
    // ближе персонаж, тем круче вверх уводит направление, и его выносит на уступ.
    // Посреди стены выходить некуда, и подброс только задрал бы персонажа по ней вверх.
    if (this.lifting) {
      this.direction.y += GameConfig.grapple.rise;
    }
    this.direction.scaleInPlace(GameConfig.grapple.speed / this.direction.length());
    this.player.pull(this.direction);

    return this.state;
  }

  /**
   * Зацепился ли крюк у кромки, за которой есть куда выйти.
   *
   * Верх преграды берётся из удара, а не из геометрии сцены, поэтому работает для любого
   * физического тела, а не только для стены: во что куб примёрз, то и мерим.
   */
  private isOnLedge(attachment: Vector3): boolean {
    const top = this.impacts.surfaceTop;

    return top !== null && top - attachment.y <= GameConfig.grapple.edgeReach;
  }
}
