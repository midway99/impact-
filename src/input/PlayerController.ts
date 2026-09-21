import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Player } from "../entities/Player";
import type { KeyboardState } from "./KeyboardState";

/** Физические коды клавиш движения. */
enum MoveKey {
  Forward = "KeyW",
  Back = "KeyS",
  Left = "KeyA",
  Right = "KeyD",
}

/**
 * WASD-движение персонажа относительно взгляда камеры.
 * Управляет телом через скорость: масса сохраняется, поэтому удар о стену остаётся физическим.
 */
export class PlayerController {
  private readonly scene: Scene;
  private readonly camera: Camera;
  private readonly keyboard: KeyboardState;
  private readonly body: PhysicsBody;

  // Scratch-вектора: переиспользуются каждый кадр, чтобы не мусорить в горячем пути.
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly direction = new Vector3();
  private readonly velocity = new Vector3();

  private readonly update = (): void => this.applyInput();

  public constructor(scene: Scene, camera: Camera, player: Player, keyboard: KeyboardState) {
    this.scene = scene;
    this.camera = camera;
    this.keyboard = keyboard;
    this.body = player.body.body;

    this.scene.onBeforeRenderObservable.add(this.update);
  }

  private applyInput(): void {
    this.readDirection();

    // Вертикальную скорость не трогаем — за падение отвечает гравитация.
    this.body.getLinearVelocityToRef(this.velocity);
    this.velocity.x = this.direction.x * GameConfig.player.speed;
    this.velocity.z = this.direction.z * GameConfig.player.speed;
    this.body.setLinearVelocity(this.velocity);
  }

  /** Направление в плоскости пола: оси камеры без вертикальной составляющей. */
  private readDirection(): void {
    this.camera.getDirectionToRef(Axis.Z, this.forward);
    this.forward.y = 0;
    this.forward.normalize();

    this.camera.getDirectionToRef(Axis.X, this.right);
    this.right.y = 0;
    this.right.normalize();

    this.direction.setAll(0);

    if (this.keyboard.isPressed(MoveKey.Forward)) {
      this.direction.addInPlace(this.forward);
    }
    if (this.keyboard.isPressed(MoveKey.Back)) {
      this.direction.subtractInPlace(this.forward);
    }
    if (this.keyboard.isPressed(MoveKey.Right)) {
      this.direction.addInPlace(this.right);
    }
    if (this.keyboard.isPressed(MoveKey.Left)) {
      this.direction.subtractInPlace(this.right);
    }

    // По диагонали скорость не должна быть выше, чем по прямой.
    if (this.direction.lengthSquared() > 1) {
      this.direction.normalize();
    }
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
  }
}
