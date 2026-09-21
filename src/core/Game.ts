import { Engine } from "@babylonjs/core/Engines/engine";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import { CubePool } from "../entities/CubePool";
import { Player } from "../entities/Player";
import { TargetWall } from "../entities/TargetWall";
import { KeyboardState } from "../input/KeyboardState";
import { PlayerController } from "../input/PlayerController";
import { ThrowController } from "../input/ThrowController";
import { Arena } from "../scene/Arena";
import { GameConfig } from "./GameConfig";

const MS_PER_SECOND = 1000;

/** Владелец движка, сцены и игрового цикла. Логика сущностей живёт в отдельных классах. */
export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly arena: Arena;
  private readonly player: Player;
  private readonly wall: TargetWall;
  private readonly cubes: CubePool;
  private readonly keyboard: KeyboardState;
  private readonly movement: PlayerController;
  private readonly throwing: ThrowController;

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();
  private readonly update = (): void => this.tick(this.engine.getDeltaTime() / MS_PER_SECOND);

  public constructor(canvas: HTMLCanvasElement, physics: HavokPlugin) {
    this.engine = new Engine(canvas, true, { stencil: true }, true);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = GameConfig.clearColor.toColor4(1);
    this.scene.gravity.copyFrom(GameConfig.gravity);
    // Физику включаем до создания сущностей: их тела добавляются в уже готовый мир.
    this.scene.enablePhysics(GameConfig.gravity, physics);

    this.arena = new Arena(this.scene, canvas);
    this.player = new Player(this.scene);
    this.wall = new TargetWall(this.scene);
    this.cubes = new CubePool(this.scene, physics);

    const camera = this.arena.viewCamera;
    this.keyboard = new KeyboardState();
    this.movement = new PlayerController(camera, this.player, this.keyboard);
    this.throwing = new ThrowController(camera, this.player, this.keyboard, this.cubes);
  }

  public start(): void {
    this.scene.onBeforeRenderObservable.add(this.update);
    this.engine.runRenderLoop(this.renderFrame);
    window.addEventListener("resize", this.handleResize);
  }

  /** Один кадр игровой логики: порядок вызовов систем задан здесь явно. */
  private tick(deltaSeconds: number): void {
    this.movement.update();
    this.throwing.update(deltaSeconds);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.engine.stopRenderLoop(this.renderFrame);
    this.keyboard.dispose();
    this.cubes.dispose();
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
