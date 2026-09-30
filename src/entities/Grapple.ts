
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../core/GameConfig";
import type { Player } from "./Player";
import type { Rope } from "./Rope";

/** Состояние рывка. Отдельный тип, чтобы не заводить пару перекрывающихся флагов. */
enum GrappleState {
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
  private readonly direction = new Vector3();

  private state = GrappleState.Idle;

  public constructor(player: Player, rope: Rope) {
    this.player = player;
    this.rope = rope;
  }

  /** Тянет персонажа, если есть за что. `true` — этим кадром управляет верёвка, а не игрок. */
  public update(): boolean {
    const attachment = this.rope.attachment;

    // Новый бросок обнуляет рывок сам: летящий куб ещё не крепление.
    if (!attachment) {
      this.state = GrappleState.Idle;

      return false;
    }

    if (this.state === GrappleState.Arrived) {
      return false;
    }

    attachment.subtractToRef(this.player.position, this.direction);
    const distance = this.direction.length();
    if (distance <= GameConfig.grapple.arriveDistance) {
      this.state = GrappleState.Arrived;

      return false;
    }

    this.state = GrappleState.Pulling;
    this.direction.scaleInPlace(GameConfig.grapple.speed / distance);
    this.player.pull(this.direction);

    return true;
  }
}
