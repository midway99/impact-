// Side-effect импорт: без него у сцены нет свойства debugLayer.
import "@babylonjs/core/Debug/debugLayer";
import type { Scene } from "@babylonjs/core/scene";

import { KeyBinding } from "../input/KeyBinding";
import type { KeyboardState } from "../input/KeyboardState";

/**
 * Инспектор Babylon по клавише, только в режиме разработки.
 *
 * Он тянет за собой React и Fluent UI (несколько мегабайт) и перерисовывает свой интерфейс
 * каждый кадр, поэтому постоянно включённым держать его нельзя: это съедает кадр.
 * Динамический импорт оставляет его вне production-сборки.
 */
export class InspectorToggle {
  private readonly scene: Scene;
  private readonly keyboard: KeyboardState;
  private loading = false;

  public constructor(scene: Scene, keyboard: KeyboardState) {
    this.scene = scene;
    this.keyboard = keyboard;
  }

  public update(): void {
    if (!this.keyboard.consumePress(KeyBinding.Inspector)) {
      return;
    }

    if (this.scene.debugLayer.isVisible()) {
      this.scene.debugLayer.hide();
      return;
    }

    this.show();
  }

  private show(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;

    void import("@babylonjs/inspector").then(() => {
      this.loading = false;
      void this.scene.debugLayer.show({ embedMode: true });
    });
  }
}
