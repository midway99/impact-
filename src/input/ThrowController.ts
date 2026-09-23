import { GameConfig } from "../core/GameConfig";
import type { CubePool } from "../entities/CubePool";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";
import type { ThrowAim } from "./ThrowAim";

/** Бросок куба по клавише: параметры берёт из прицела, сам куб — из пула. */
export class ThrowController {
  private readonly keyboard: KeyboardState;
  private readonly aim: ThrowAim;
  private readonly cubes: CubePool;

  private cooldownLeft = 0;

  public constructor(keyboard: KeyboardState, aim: ThrowAim, cubes: CubePool) {
    this.keyboard = keyboard;
    this.aim = aim;
    this.cubes = cubes;
  }

  public update(deltaSeconds: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - deltaSeconds);

    // Одно нажатие — один бросок; нажатие во время перезарядки пропадает.
    if (this.keyboard.consumePress(KeyBinding.Throw) && this.cooldownLeft === 0) {
      this.cubes.launchNext(this.aim.origin, this.aim.velocity);
      this.cooldownLeft = GameConfig.throwable.cooldown;
    }
  }
}
