import type { Camera } from "@babylonjs/core/Cameras/camera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Nullable } from "@babylonjs/core/types";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Player } from "../entities/Player";

/** Вид от первого лица: камера сидит в голове персонажа, мышь крутит взгляд. */
export class FirstPersonCamera {
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private readonly view: UniversalCamera;
  private readonly pointerObserver: Nullable<Observer<PointerInfo>>;

  /** Клик по сцене захватывает мышь, иначе взгляд упирается в край окна. */
  private readonly capturePointer = (): void => {
    void this.canvas.requestPointerLock();
  };

  public constructor(scene: Scene, canvas: HTMLCanvasElement, player: Player) {
    const { eyeHeight, angularSensibility, minZ } = GameConfig.camera;

    this.scene = scene;
    this.canvas = canvas;
    this.view = new UniversalCamera("first-person-camera", new Vector3(0, eyeHeight, 0), scene);
    // Камера едет вместе с капсулой: её положение задаёт физика, а не ввод.
    this.view.parent = player.transform;
    this.view.minZ = minZ;
    this.view.inertia = 0;
    this.view.angularSensibility = angularSensibility;
    this.view.attachControl(canvas, true);
    // У UniversalCamera есть собственный WASD — он двигал бы камеру мимо физики.
    this.view.inputs.removeByType("FreeCameraKeyboardMoveInput");

    this.pointerObserver = scene.onPointerObservable.add(
      this.capturePointer,
      PointerEventTypes.POINTERDOWN,
    );
  }

  public get camera(): Camera {
    return this.view;
  }

  /** Ограничение взгляда по вертикали: иначе голова прокручивается через затылок. */
  public update(): void {
    const limit = GameConfig.camera.maxPitch;

    this.view.rotation.x = Math.min(limit, Math.max(-limit, this.view.rotation.x));
  }

  public dispose(): void {
    this.scene.onPointerObservable.remove(this.pointerObserver);
    this.view.dispose();
  }
}
