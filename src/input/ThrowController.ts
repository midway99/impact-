import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../core/GameConfig";
import type { CubePool } from "../entities/CubePool";
import type { Player } from "../entities/Player";
import { CameraAxes } from "./CameraAxes";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";

/** Бросок куба по клавише: считает точку вылета и скорость, сам куб берёт из пула. */
export class ThrowController {
  private readonly camera: Camera;
  private readonly player: Player;
  private readonly keyboard: KeyboardState;
  private readonly cubes: CubePool;

  private readonly forward = new Vector3();
  private readonly origin = new Vector3();
  private readonly velocity = new Vector3();

  private cooldownLeft = 0;

  public constructor(camera: Camera, player: Player, keyboard: KeyboardState, cubes: CubePool) {
    this.camera = camera;
    this.player = player;
    this.keyboard = keyboard;
    this.cubes = cubes;
  }

  public update(deltaSeconds: number): void {
    this.cooldownLeft = Math.max(0, this.cooldownLeft - deltaSeconds);

    // Одно нажатие — один бросок; нажатие во время перезарядки пропадает.
    if (this.keyboard.consumePress(KeyBinding.Throw) && this.cooldownLeft === 0) {
      this.throwCube();
    }
  }

  private throwCube(): void {
    const { speed, lift, spawnForward, spawnHeight, cooldown } = GameConfig.throwable;

    CameraAxes.groundAxisToRef(this.camera, Axis.Z, this.forward);

    // Точка вылета — перед персонажем, чтобы куб не родился внутри капсулы.
    this.forward.scaleToRef(spawnForward, this.origin);
    this.origin.addInPlace(this.player.position);
    this.origin.y += spawnHeight;

    this.forward.scaleToRef(speed, this.velocity);
    this.velocity.y = lift;

    this.cubes.launchNext(this.origin, this.velocity);
    this.cooldownLeft = cooldown;
  }
}
