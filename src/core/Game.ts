import { Engine } from "@babylonjs/core/Engines/engine";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import { TrajectoryPreview } from "../effects/TrajectoryPreview";
import { CubePool } from "../entities/CubePool";
import { Player } from "../entities/Player";
import { TargetWall } from "../entities/TargetWall";
import { KeyboardState } from "../input/KeyboardState";
import { PlayerController } from "../input/PlayerController";
import { ThrowAim } from "../input/ThrowAim";
import { ThrowController } from "../input/ThrowController";
import { Arena } from "../scene/Arena";
import { FirstPersonCamera } from "../scene/FirstPersonCamera";
import { GameConfig } from "./GameConfig";

const MS_PER_SECOND = 1000;

/** Владелец движка, сцены и игрового цикла. Логика сущностей живёт в отдельных классах. */
export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly arena: Arena;
  private readonly player: Player;
  private readonly view: FirstPersonCamera;
  private readonly wall: TargetWall;
  private readonly cubes: CubePool;
  private readonly keyboard: KeyboardState;
  private readonly movement: PlayerController;
  private readonly aim: ThrowAim;
  private readonly throwing: ThrowController;
  private readonly trajectory: TrajectoryPreview;

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();
  private readonly update = (): void => this.tick(this.engine.getDeltaTime() / MS_PER_SECOND);

  public constructor(canvas: HTMLCanvasElement, physics: HavokPlugin) {
    this.engine = new Engine(canvas, true, { stencil: true }, true);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = GameConfig.clearColor.toColor4(1);
    this.scene.enablePhysics(GameConfig.gravity, physics);

    this.arena = new Arena(this.scene);
    this.player = new Player(this.scene);
    // Камера внутри капсулы: своё тело не рисуем, иначе оно закрывает обзор.
    this.player.setVisible(false);
    this.view = new FirstPersonCamera(this.scene, canvas, this.player);
    this.wall = new TargetWall(this.scene);
    this.cubes = new CubePool(this.scene, physics);

    const camera = this.view.camera;
    this.keyboard = new KeyboardState();
    this.movement = new PlayerController(camera, this.player, this.keyboard);
    this.aim = new ThrowAim(camera, this.player);
    this.throwing = new ThrowController(this.keyboard, this.aim, this.cubes);
    this.trajectory = new TrajectoryPreview(this.scene, physics, this.aim);
  }

  public start(): void {
    this.scene.onBeforeRenderObservable.add(this.update);
    this.engine.runRenderLoop(this.renderFrame);
    window.addEventListener("resize", this.handleResize);
  }

  /** Один кадр игровой логики: порядок вызовов систем задан здесь явно. */
  private tick(deltaSeconds: number): void {
    this.view.update();
    this.movement.update();
    this.aim.update();
    this.throwing.update(deltaSeconds);
    this.trajectory.update();
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.engine.stopRenderLoop(this.renderFrame);
    this.keyboard.dispose();
    this.trajectory.dispose();
    this.view.dispose();
    this.cubes.dispose();
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
