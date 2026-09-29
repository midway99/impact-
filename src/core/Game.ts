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
import { ImpactFreezer } from "../physics/ImpactFreezer";
import { BoxCollider } from "../physics/rope/BoxCollider";
import { GroundCollider } from "../physics/rope/GroundCollider";
import type { RopeCollider } from "../physics/rope/RopeCollider";
import { Arena } from "../scene/Arena";
import { FirstPersonCamera } from "../scene/FirstPersonCamera";
import { GameConfig } from "./GameConfig";

const MS_PER_SECOND = 1000;
/** PhysicsEngine._step обрезает шаг Havok сверху этим значением, с. */
const MAX_PHYSICS_STEP_SECONDS = 0.1;
const GROUND_HEIGHT = 0;

/** Владелец движка, сцены и игрового цикла. Логика сущностей живёт в отдельных классах. */
export class Game {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly arena: Arena;
  private readonly player: Player;
  private readonly view: FirstPersonCamera;
  private readonly wall: TargetWall;
  private readonly cubes: CubePool;
  private readonly freezer: ImpactFreezer;
  private readonly rope: Rope;
  private readonly ropeView: RopeRenderer;
  private readonly keyboard: KeyboardState;
  private readonly movement: PlayerController;
  private readonly aim: ThrowAim;
  private readonly throwing: ThrowController;
  private readonly trajectory: TrajectoryPreview;
  /** Инструмент разработки: подключается динамически и только в dev-режиме. */
  private inspector?: { update(): void };

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();
  private readonly update = (): void => this.tick(this.engine.getDeltaTime() / MS_PER_SECOND);
  /** Верёвка — сразу после шага Havok: куб уже на новом месте, и шаг у них общий. */
  private readonly afterPhysics = (): void => this.stepRope();

  public constructor(canvas: HTMLCanvasElement, physics: HavokPlugin) {
    const { antialias, maxPixelRatio } = GameConfig.render;

    this.engine = new Engine(canvas, antialias, { stencil: true }, false);
    // Уровень 1 — один пиксель рендера на CSS-пиксель; меньше единицы = сверхвыборка.
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, maxPixelRatio));

    this.scene = new Scene(this.engine);
    this.scene.clearColor = GameConfig.clearColor.toColor4(1);
    // Мы не выбираем объекты указателем: незачем трассировать луч на каждое движение мыши.
    this.scene.skipPointerMovePicking = true;
    this.scene.enablePhysics(GameConfig.gravity, physics);

    this.arena = new Arena(this.scene);
    this.player = new Player(this.scene);
    // Камера внутри капсулы: своё тело не рисуем, иначе оно закрывает обзор.
    this.player.setVisible(false);
    this.view = new FirstPersonCamera(this.scene, canvas, this.player);
    this.wall = new TargetWall(this.scene);
    this.cubes = new CubePool(this.scene, physics);
    this.freezer = new ImpactFreezer(physics);
    this.rope = new Rope(this.player, this.createRopeColliders());
    this.ropeView = new RopeRenderer(this.scene, this.rope);

    const camera = this.view.camera;
    this.keyboard = new KeyboardState();
    this.movement = new PlayerController(camera, this.player, this.keyboard, this.rope);
    this.aim = new ThrowAim(camera, this.player);
    this.throwing = new ThrowController(this.keyboard, this.aim, this.cubes, this.rope);
    this.trajectory = new TrajectoryPreview(this.scene, physics, this.aim);
  }

  /** Инспектор Babylon (клавиша ~) живёт только в разработке: в сборку он не попадает. */
  private loadInspector(): void {
    if (!import.meta.env.DEV) {
      return;
    }

    void import("../ui/InspectorToggle").then(({ InspectorToggle }) => {
      this.inspector = new InspectorToggle(this.scene, this.keyboard);
    });
  }

  public start(): void {
    this.loadInspector();
    this.scene.onBeforeRenderObservable.add(this.update);
    this.scene.onAfterPhysicsObservable.add(this.afterPhysics);
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
    this.inspector?.update();
  }

  private stepRope(): void {
    this.rope.update(this.physicsStepSeconds());
    this.ropeView.update();
  }

  /** Тот же шаг, с которым Babylon только что шагнул Havok: дельта кадра, обрезанная как в Scene и PhysicsEngine. */
  private physicsStepSeconds(): number {
    const deltaMs = Math.max(Scene.MinDeltaTime, Math.min(this.engine.getDeltaTime(), Scene.MaxDeltaTime));

    return Math.min(deltaMs / MS_PER_SECOND, MAX_PHYSICS_STEP_SECONDS);
  }

  private createRopeColliders(): readonly RopeCollider[] {
    const { thickness, friction } = GameConfig.rope;

    return [
      new GroundCollider(GROUND_HEIGHT, thickness / 2, friction),
      new BoxCollider(this.wall.transform, this.wall.halfExtents, thickness / 2),
    ];
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.scene.onAfterPhysicsObservable.removeCallback(this.afterPhysics);
    this.engine.stopRenderLoop(this.renderFrame);
    this.keyboard.dispose();
    this.freezer.dispose();
    this.trajectory.dispose();
    this.view.dispose();
    this.ropeView.dispose();
    this.cubes.dispose();
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
