import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";
import type { ThrowableCube } from "../entities/ThrowableCube";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";
import type { ThrowAim } from "./ThrowAim";

/**
 * Бросок куба на верёвке с зарядом: нажатие начинает набор, отпускание бросает.
 * Чем дольше держали, тем выше скорость вылета — от `minSpeed` до `maxSpeed`.
 *
 * Сам заряд наружу отдаётся долей `power`: по ней прицел строит скорость, а за ним
 * и пунктир траектории, так что дуга на экране тянется вместе с удержанием.
 */
export class ThrowController {
  private readonly keyboard: KeyboardState;
  private readonly aim: ThrowAim;
  private readonly cube: ThrowableCube;
  private readonly rope: Rope;

  private cooldownLeft = 0;
  private heldSeconds = 0;
  private charging = false;

  public constructor(keyboard: KeyboardState, aim: ThrowAim, cube: ThrowableCube, rope: Rope) {
    this.keyboard = keyboard;
    this.aim = aim;
    this.cube = cube;
    this.rope = rope;
  }

  /** Набранный заряд, 0..1. */
  public get power(): number {
    return Math.min(1, this.heldSeconds / GameConfig.throwable.chargeSeconds);
  }

  /** Идёт ли набор прямо сейчас: по нему HUD показывает и прячет кольцо силы. */
  public get isCharging(): boolean {
    return this.charging;
  }

  public update(deltaSeconds: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - deltaSeconds);

    if (!this.charging) {
      this.startCharge();

      return;
    }

    if (this.keyboard.isPressed(KeyBinding.Throw)) {
      this.heldSeconds += deltaSeconds;

      return;
    }

    // Клавиша больше не нажата. Отпускание — бросок; его отсутствие означает потерю
    // фокуса окна, и тогда заряд просто пропадает, без броска вслепую.
    if (this.keyboard.consumeRelease(KeyBinding.Throw)) {
      this.throwCube();
      this.cooldownLeft = GameConfig.throwable.cooldown;
    }
    this.charging = false;
    this.heldSeconds = 0;
  }

  private startCharge(): void {
    if (!this.keyboard.consumePress(KeyBinding.Throw) || this.cooldownLeft > 0) {
      return;
    }

    this.charging = true;
    this.heldSeconds = 0;
  }

  private throwCube(): void {
    const { origin, velocity } = this.aim;

    this.cube.launch(origin, velocity);
    this.rope.launch(origin, velocity, this.cube.body, this.power);
  }
}
