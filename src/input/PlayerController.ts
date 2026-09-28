import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { Player } from "../entities/Player";
import type { Rope } from "../entities/Rope";
import { CameraAxes } from "./CameraAxes";
import { KeyBinding } from "./KeyBinding";
import type { KeyboardState } from "./KeyboardState";

/** WASD-движение персонажа относительно взгляда камеры. Тело не трогает — вызывает `Player.move`. */
export class PlayerController {
  private readonly camera: Camera;
  private readonly player: Player;
  private readonly keyboard: KeyboardState;
  private readonly rope: Rope;

  // Scratch-вектора: переиспользуются каждый кадр, чтобы не мусорить в горячем пути.
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly direction = new Vector3();

  public constructor(camera: Camera, player: Player, keyboard: KeyboardState, rope: Rope) {
    this.camera = camera;
    this.player = player;
    this.keyboard = keyboard;
    this.rope = rope;
  }

  public update(): void {
    this.readDirection();
    this.rope.clampMovement(this.direction);
    this.player.move(this.direction);
  }

  private readDirection(): void {
    CameraAxes.groundAxisToRef(this.camera, Axis.Z, this.forward);
    CameraAxes.groundAxisToRef(this.camera, Axis.X, this.right);

    this.direction.setAll(0);

    if (this.keyboard.isPressed(KeyBinding.Forward)) {
      this.direction.addInPlace(this.forward);
    }
    if (this.keyboard.isPressed(KeyBinding.Back)) {
      this.direction.subtractInPlace(this.forward);
    }
    if (this.keyboard.isPressed(KeyBinding.Right)) {
      this.direction.addInPlace(this.right);
    }
    if (this.keyboard.isPressed(KeyBinding.Left)) {
      this.direction.subtractInPlace(this.right);
    }

    // По диагонали скорость не должна быть выше, чем по прямой.
    if (this.direction.lengthSquared() > 1) {
      this.direction.normalize();
    }
  }
}
