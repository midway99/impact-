import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { TargetWall } from "../entities/TargetWall";
import { Player } from "../entities/Player";
import { Arena } from "../scene/Arena";
import { GameConfig } from "./GameConfig";

/** Владелец движка, сцены и рендер-цикла. Логика сущностей живёт в отдельных классах. */
export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly arena: Arena;
  private readonly player: Player;
  private readonly wall: TargetWall;

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();

  public constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true }, true);

    this.scene = new Scene(this.engine);
    this.scene.clearColor = GameConfig.clearColor.toColor4(1);
    this.scene.gravity.copyFrom(GameConfig.gravity);

    this.arena = new Arena(this.scene, canvas);
    this.player = new Player(this.scene);
    this.wall = new TargetWall(this.scene);
  }

  public start(): void {
    this.engine.runRenderLoop(this.renderFrame);
    window.addEventListener("resize", this.handleResize);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.engine.stopRenderLoop(this.renderFrame);
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
