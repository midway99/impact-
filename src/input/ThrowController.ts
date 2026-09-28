import { GameConfig } from "../core/GameConfig";
import type { CubePool } from "../entities/CubePool";
import type { Rope } from "../entities/Rope";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";
import type { ThrowAim } from "./ThrowAim";

/** Бросок куба на верёвке по клавише: параметры берёт из прицела, сам куб — из пула. */
export class ThrowController {
  private readonly keyboard: KeyboardState;
  private readonly aim: ThrowAim;
  private readonly cubes: CubePool;
  private readonly rope: Rope;

  private cooldownLeft = 0;

  public constructor(keyboard: KeyboardState, aim: ThrowAim, cubes: CubePool, rope: Rope) {
    this.keyboard = keyboard;
    this.aim = aim;
    this.cubes = cubes;
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
    const cube = this.cubes.launchNext(origin, velocity);

    if (cube) {
       this.rope.launch(origin, velocity, cube);
    }
  }
}
