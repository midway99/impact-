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
 * Рывок на верёвке: как только брошенный куб примёрз, персонажа тянет к этому месту.
 *
 * Пока тянет — ввод в движении не участвует и гравитация не действует: скорость тела
 * задаётся целиком, каждый кадр заново. Иначе полёт и ходьба спорили бы за одну скорость.
 *
 * Зацеп у кромки — особый случай: целью становится не крюк, а точка над опорой за кромкой,
 * и персонаж заходит на уступ сверху вместо удара в его край.
 */
export class Grapple {
  private readonly player: Player;
  private readonly rope: Rope;
  private readonly impacts: ImpactFreezer;
  private readonly direction = new Vector3();
  /** Куда ведём персонажа: сам крюк или точка над уступом за его кромкой. */
  private readonly goal = new Vector3();
  /** Горизонтальное направление «от персонажа в преграду» на момент зацепа. */
  private readonly inward = new Vector3();

  private state = GrappleState.Idle;
  /** Заходим ли на уступ: решается один раз, когда рывок начинается. */
  private mounting = false;
  private ledgeTop = 0;
  private pullSeconds = 0;

  public constructor(player: Player, rope: Rope, impacts: ImpactFreezer) {
    this.player = player;
    this.rope = rope;
    this.impacts = impacts;
  }

  /**
   * Тянет персонажа, если есть за что, и отдаёт состояние рывка:
   * `Pulling` — этим кадром управляет верёвка, а не игрок; `Arrived` — рывок закончен.
   */
  public update(deltaSeconds: number): GrappleState {
    const attachment = this.rope.attachment;

    // Новый бросок обнуляет рывок сам: летящий куб ещё не крепление.
    if (!attachment) {
      this.state = GrappleState.Idle;

      return this.state;
    }

    if (this.state === GrappleState.Arrived) {
      return this.state;
    }

    // Цель выбирается один раз на зацеп: крюк примёрз, и над ним уже ничего не изменится.
    if (this.state !== GrappleState.Pulling) {
      this.state = GrappleState.Pulling;
      this.pullSeconds = 0;
      this.aimAt(attachment);
    } else {
      this.pullSeconds += deltaSeconds;
    }

    // Страховка: заход может упереться в геометрию, а зависший рывок навсегда отнял бы ввод.
    if (this.pullSeconds > GameConfig.grapple.maxPullSeconds || this.hasArrived(attachment)) {
      this.state = GrappleState.Arrived;

      return this.state;
    }

    this.goal.subtractToRef(this.player.position, this.direction);
    this.direction.scaleInPlace(GameConfig.grapple.speed / this.direction.length());
    this.player.pull(this.direction);

    return this.state;
  }

  /**
   * Куда лететь. По умолчанию — в крюк; если он у кромки, то в точку над опорой за ней.
   *
   * Верх преграды приходит из удара, а не из геометрии сцены, поэтому заход работает
   * для любого физического тела: во что куб примёрз, на то и заходим.
   */
  private aimAt(hook: Vector3): void {
    const { edgeReach, ledgeInset, ledgeClearance } = GameConfig.grapple;
    const top = this.impacts.surfaceTop;

    this.goal.copyFrom(hook);
    this.mounting = false;

    if (top === null || top - hook.y > edgeReach || !this.measureInward(hook)) {
      return;
    }

    this.mounting = true;
    this.ledgeTop = top;
    // Внутрь от кромки и выше опоры: прилетев сюда, персонаж стоит над уступом,
    // а не упирается в его край, и дальше его просто опускает гравитация.
    this.goal.set(
      hook.x + this.inward.x * ledgeInset,
      top + GameConfig.player.height / 2 + ledgeClearance,
      hook.z + this.inward.z * ledgeInset,
    );
  }

  /** Горизонтальное направление в преграду; `false`, если персонаж ровно под крюком. */
  private measureInward(hook: Vector3): boolean {
    const position = this.player.position;

    this.inward.set(hook.x - position.x, 0, hook.z - position.z);
    const span = this.inward.length();

    if (span === 0) {
      return false;
    }
    this.inward.scaleInPlace(1 / span);

    return true;
  }

  /**
   * Обычный рывок кончается рядом с крюком. Заход на уступ — когда персонаж поднялся
   * выше опоры и перевалил кромку: дальше тянуть нечего, остальное сделает гравитация.
   */
  private hasArrived(hook: Vector3): boolean {
    const position = this.player.position;

    if (!this.mounting) {
      const arrive = GameConfig.grapple.arriveDistance;

      return Vector3.DistanceSquared(position, hook) <= arrive * arrive;
    }

    const feet = position.y - GameConfig.player.height / 2;
    const past =
      (position.x - hook.x) * this.inward.x + (position.z - hook.z) * this.inward.z;

    return feet > this.ledgeTop && past > 0;
  }
}
