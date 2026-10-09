import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

import { GameConfig } from "../core/GameConfig";

const FPS_COUNTER_CLASS = "fps-counter";
const FPS_LABEL = "fps";

/** Лёгкий DOM-HUD поверх canvas: показывает текущий FPS без Babylon GUI. */
export class FpsCounter {
  private readonly engine: AbstractEngine;
  private readonly element: HTMLDivElement;
  private elapsedSeconds = GameConfig.hud.fpsUpdateInterval;
  private lastFps = -1;

  public constructor(engine: AbstractEngine, parent: HTMLElement) {
    this.engine = engine;
    this.element = document.createElement("div");
    this.element.className = FPS_COUNTER_CLASS;
    this.element.setAttribute("aria-label", "Frames per second");
    parent.appendChild(this.element);
  }

  public update(deltaSeconds: number): void {
    this.elapsedSeconds += deltaSeconds;

    if (this.elapsedSeconds < GameConfig.hud.fpsUpdateInterval) {
      return;
    }

    this.elapsedSeconds = 0;
    this.writeFps(Math.round(this.engine.getFps()));
  }

  public dispose(): void {
    this.element.remove();
  }

  private writeFps(fps: number): void {
    if (fps === this.lastFps) {
      return;
    }

    this.lastFps = fps;
    this.element.textContent = `${fps} ${FPS_LABEL}`;
  }
}
