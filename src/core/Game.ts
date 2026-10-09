import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { Scene } from "@babylonjs/core/scene";

import { RopeModel } from "../effects/RopeModel";
import { RopeRenderer } from "../effects/RopeRenderer";
import type { RopeShape } from "../effects/RopeShape";
import { TrajectoryPreview } from "../effects/TrajectoryPreview";
import { Grapple, GrappleState } from "../entities/Grapple";
import { Player } from "../entities/Player";
import { Rope } from "../entities/Rope";
import { TargetWall } from "../entities/TargetWall";
import { ThrowableCube } from "../entities/ThrowableCube";
import { KeyboardState } from "../input/KeyboardState";
import { PlayerController } from "../input/PlayerController";
import { ThrowAim } from "../input/ThrowAim";
import { ThrowController } from "../input/ThrowController";
import { BoxCollider } from "../physics/rope/BoxCollider";
import { GroundCollider } from "../physics/rope/GroundCollider";
import { ImpactFreezer } from "../physics/ImpactFreezer";
import type { RopeCollider } from "../physics/rope/RopeCollider";
import { Arena } from "../scene/Arena";
import { FirstPersonCamera } from "../scene/FirstPersonCamera";
import { ChargeGauge } from "../ui/ChargeGauge";
import { FpsCounter } from "../ui/FpsCounter";
import { GameConfig } from "./GameConfig";

const MS_PER_SECOND = 1000;
/** PhysicsEngine._step обрезает шаг Havok сверху этим значением, с. */
const MAX_PHYSICS_STEP_SECONDS = 0.1;
const GROUND_HEIGHT = 0;

/** Владелец движка, сцены и игрового цикла. Логика сущностей живёт в отдельных классах. */
export class Game {
  /** Движок приходит из сцены: конкретный класс здесь не нужен, только управление циклом. */
  private readonly engine: AbstractEngine;
  private readonly scene: Scene;
  private readonly arena: Arena;
  private readonly player: Player;
  private readonly view: FirstPersonCamera;
  private readonly wall: TargetWall;
  private readonly cube: ThrowableCube;
  private readonly freezer: ImpactFreezer;
  private readonly rope: Rope;
  private readonly ropeView: RopeRenderer;
  private readonly keyboard: KeyboardState;
  private readonly movement: PlayerController;
  private readonly grapple: Grapple;
  private readonly aim: ThrowAim;
  private readonly throwing: ThrowController;
  private readonly trajectory: TrajectoryPreview;
  private readonly fps: FpsCounter;
  private readonly chargeGauge: ChargeGauge;
  /** Инструмент разработки: подключается динамически и только в dev-режиме. */
  private inspector?: { update(): void; dispose(): void };

  /** Колбэки создаются один раз: в кадре не должно появляться новых замыканий. */
  private readonly renderFrame = (): void => this.scene.render();
  private readonly handleResize = (): void => this.engine.resize();
  private readonly update = (): void => this.tick(this.engine.getDeltaTime() / MS_PER_SECOND);
  /** Верёвка — сразу после шага Havok: куб уже на новом месте, и шаг у них общий. */
  private readonly afterPhysics = (): void => this.stepRope();

  /**
   * Асинхронная, потому что геометрия верёвки приходит из модели, а её надо загрузить.
   * Движок и сцена создаются здесь же: без сцены модель загрузить некуда.
   */
  public static async create(canvas: HTMLCanvasElement, physics: HavokPlugin): Promise<Game> {
    const scene = Game.createScene(Game.createEngine(canvas), physics);

    return new Game(canvas, scene, physics, await RopeModel.load(scene));
  }

  private static createEngine(canvas: HTMLCanvasElement): Engine {
    const { antialias, maxPixelRatio } = GameConfig.render;
    const engine = new Engine(canvas, antialias, { stencil: true }, false);

    // Уровень 1 — один пиксель рендера на CSS-пиксель; меньше единицы = сверхвыборка.
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, maxPixelRatio));

    return engine;
  }

  private static createScene(engine: Engine, physics: HavokPlugin): Scene {
    const scene = new Scene(engine);

    scene.clearColor = GameConfig.clearColor.toColor4(1);
    // Мы не выбираем объекты указателем: незачем трассировать луч на каждое движение мыши.
    scene.skipPointerMovePicking = true;
    scene.enablePhysics(GameConfig.gravity, physics);

    return scene;
  }

  private constructor(
    canvas: HTMLCanvasElement,
    scene: Scene,
    physics: HavokPlugin,
    ropeShape: RopeShape,
  ) {
    this.engine = scene.getEngine();
    this.scene = scene;

    this.arena = new Arena(this.scene);
    this.player = new Player(this.scene);
    // Камера внутри капсулы: своё тело не рисуем, иначе оно закрывает обзор.
    this.player.setVisible(false);
    this.view = new FirstPersonCamera(this.scene, canvas, this.player);
    this.wall = new TargetWall(this.scene);
    this.cube = new ThrowableCube(this.scene, physics);
    this.freezer = new ImpactFreezer(physics);
    this.rope = new Rope(this.player, this.createRopeColliders());
    this.ropeView = new RopeRenderer(this.scene, this.rope, ropeShape);

    const camera = this.view.camera;
    this.keyboard = new KeyboardState();
    this.movement = new PlayerController(camera, this.player, this.keyboard, this.rope);
    this.grapple = new Grapple(this.player, this.rope, this.freezer);
    this.aim = new ThrowAim(camera, this.player);
    this.throwing = new ThrowController(this.keyboard, this.aim, this.cube, this.rope);
    this.trajectory = new TrajectoryPreview(this.scene, physics, this.aim);
    this.fps = new FpsCounter(this.engine, document.body);
    this.chargeGauge = new ChargeGauge(document.body);
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
    this.updateMovement(deltaSeconds);
    // Прицел строится по заряду прошлого кадра. На кадре отпускания заряд уже не растёт,
    // поэтому бросок уходит ровно по той дуге, которую игрок видел.
    this.aim.update(this.throwing.power);
    this.throwing.update(deltaSeconds);
    this.chargeGauge.update(this.throwing.power, this.throwing.isCharging);
    this.trajectory.update();
    this.fps.update(deltaSeconds);
    this.inspector?.update();
  }

  /** Пока верёвка тянет персонажа, ввод в движении не участвует: иначе двое правят одну скорость. */
  private updateMovement(deltaSeconds: number): void {
    const grapple = this.grapple.update(deltaSeconds);

    if (grapple === GrappleState.Arrived) {
      this.retireThrow();
    }
    if (grapple !== GrappleState.Pulling) {
      this.movement.update();
    }
  }

  /**
   * Рывок закончен: куб уходит со сцены, верёвка отпускает крепление.
   * Дальше `RopeRenderer` сам перестаёт её рисовать, а решатель — считать.
   */
  private retireThrow(): void {
    this.cube.park();
    this.rope.release();
    // Верёвка рисуется до игровой логики: не обнови её здесь — продержится на экране лишний кадр.
    this.ropeView.update();
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
    const { radius, friction } = GameConfig.rope;

    return [
      new GroundCollider(GROUND_HEIGHT, radius, friction),
      new BoxCollider(this.wall.transform, this.wall.halfExtents, radius),
    ];
  }

  public dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.scene.onBeforeRenderObservable.removeCallback(this.update);
    this.scene.onAfterPhysicsObservable.removeCallback(this.afterPhysics);
    this.engine.stopRenderLoop(this.renderFrame);
    this.chargeGauge.dispose();
    this.keyboard.dispose();
    this.inspector?.dispose();
    this.fps.dispose();
    this.freezer.dispose();
    this.trajectory.dispose();
    this.view.dispose();
    this.ropeView.dispose();
    this.cube.dispose();
    this.wall.dispose();
    this.player.dispose();
    this.arena.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
