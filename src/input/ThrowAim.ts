import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { GameConfig } from "../core/GameConfig";
import type { Player } from "../entities/Player";

/**
 * Прицел броска: точка вылета и начальная скорость куба на текущий кадр.
 * Единый источник для самого броска и для превью траектории — они не могут разойтись.
 */
export class ThrowAim {
  private readonly camera: Camera;
  private readonly player: Player;

  private readonly forward = new Vector3();
  private readonly launchOrigin = new Vector3();
  private readonly launchVelocity = new Vector3();

  public constructor(camera: Camera, player: Player) {
    this.camera = camera;
    this.player = player;
  }

  public get origin(): Vector3 {
    return this.launchOrigin;
  }

  public get velocity(): Vector3 {
    return this.launchVelocity;
  }

  public update(): void {
    const { speed, lift, spawnForward, spawnHeight } = GameConfig.throwable;

    // Направление взгляда целиком: смотришь вверх — куб летит выше, вниз — под ноги.
    this.camera.getDirectionToRef(Axis.Z, this.forward);
    this.forward.normalize();

    // Точка вылета — перед персонажем, чтобы куб не родился внутри капсулы.
    this.forward.scaleToRef(spawnForward, this.launchOrigin);
    this.launchOrigin.addInPlace(this.player.position);
    this.launchOrigin.y += spawnHeight;

    this.forward.scaleToRef(speed, this.launchVelocity);
    // Подъём добавляется к взгляду, а не заменяет его.
    this.launchVelocity.y += lift;
  }
}
