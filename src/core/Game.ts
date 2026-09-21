import { Engine } from "@babylonjs/core/Engines/engine";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import { RopeRenderer } from "../effects/RopeRenderer";
import { TrajectoryPreview } from "../effects/TrajectoryPreview";
import { CubePool } from "../entities/CubePool";
import { Player } from "../entities/Player";
import { Rope } from "../entities/Rope";
import { TargetWall } from "../entities/TargetWall";
import { KeyboardState } from "../input/KeyboardState";
import { PlayerController } from "../input/PlayerController";
import { ThrowAim } from "../input/ThrowAim";
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
  private readonly rope: Rope;
  private readonly ropeView: RopeRenderer;
  private readonly keyboard: KeyboardState;
  private readonly movement: PlayerController;
  private readonly aim: ThrowAim;
  private readonly throwing: ThrowController;
  private readonly trajectory: TrajectoryPreview;

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();
  private readonly update = (): void => this.tick(this.engine.getDeltaTime() / MS_PER_SECOND);
  /** Визуал верёвки — после шага физики, когда звенья и куб уже на новых местах. */
  private readonly afterPhysics = (): void => this.ropeView.update();

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
    this.rope = new Rope(this.scene, physics, this.player, this.cubes.bodies);
    this.ropeView = new RopeRenderer(this.scene, this.rope);

    const camera = this.arena.viewCamera;
    this.keyboard = new KeyboardState();
    this.movement = new PlayerController(camera, this.player, this.keyboard);
    this.aim = new ThrowAim(camera, this.player);
    this.throwing = new ThrowController(this.keyboard, this.aim, this.cubes, this.rope);
    this.trajectory = new TrajectoryPreview(this.scene, physics, this.aim);
  }

  public start(): void {
    this.scene.onBeforeRenderObservable.add(this.update);
    this.scene.onAfterPhysicsObservable.add(this.afterPhysics);
    this.engine.runRenderLoop(this.renderFrame);
    window.addEventListener("resize", this.handleResize);
  }

  /** Один кадр игровой логики: порядок вызовов систем задан здесь явно. */
  private tick(deltaSeconds: number): void {
    this.movement.update();
    this.aim.update();
    this.throwing.update(deltaSeconds);
    this.trajectory.update();
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.scene.onAfterPhysicsObservable.removeCallback(this.afterPhysics);
    this.engine.stopRenderLoop(this.renderFrame);
    this.keyboard.dispose();
    this.trajectory.dispose();
    this.ropeView.dispose();
    // Верёвка держит соединения с персонажем и кубами — освобождаем её раньше них.
    this.rope.dispose();
    this.cubes.dispose();
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
