import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";
import type { ThrowableCube } from "../entities/ThrowableCube";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";
import type { ThrowAim } from "./ThrowAim";

/** Бросок куба на верёвке по клавише: параметры берёт из прицела. */
export class ThrowController {
  private readonly keyboard: KeyboardState;
  private readonly aim: ThrowAim;
  private readonly cube: ThrowableCube;
  private readonly rope: Rope;

  private cooldownLeft = 0;

  public constructor(keyboard: KeyboardState, aim: ThrowAim, cube: ThrowableCube, rope: Rope) {
    this.keyboard = keyboard;
    this.aim = aim;
    this.cube = cube;
    this.rope = rope;
  }

  public update(deltaSeconds: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - deltaSeconds);

    if (this.keyboard.consumePress(KeyBinding.Throw) && this.cooldownLeft === 0) {
      this.throwCube();
      this.cooldownLeft = GameConfig.throwable.cooldown;
    }
  }

  private throwCube(): void {
    const { origin, velocity } = this.aim;

    this.cube.launch(origin, velocity);
    this.rope.launch(origin, velocity, this.cube.body);
  }
}
