// Side-effect импорт, намеренно не в BabylonSideEffects: он нужен только инспектору.
// Панель свойств зовёт scene.getAllAnimatablesByTarget, а этот метод прототипу сцены
// добавляет модуль анимаций. Держим его здесь, чтобы он уехал в dev-чанк вместе с инспектором
// и не попал в production-сборку, где анимаций нет.
import "@babylonjs/core/Animations/animatable";
import type { InspectorToken } from "@babylonjs/inspector";
import type { Scene } from "@babylonjs/core/scene";

import { KeyBinding } from "../input/KeyBinding";
import type { KeyboardState } from "../input/KeyboardState";

type ShowInspector = (scene: Scene) => InspectorToken;

/** Загружает Inspector v2 по требованию и переключает его клавишей Backquote. */
export class InspectorToggle {
  private readonly scene: Scene;
  private readonly keyboard: KeyboardState;
  private showInspector?: ShowInspector;
  private inspector: InspectorToken | undefined;
  private loading = false;

  public constructor(scene: Scene, keyboard: KeyboardState) {
    this.scene = scene;
    this.keyboard = keyboard;
  }

  public update(): void {
    if (!this.keyboard.consumePress(KeyBinding.Inspector)) {
      return;
    }

    if (this.inspector && !this.inspector.isDisposed) {
      this.inspector.dispose();
      this.inspector = undefined;
      return;
    }

    if (this.showInspector) {
      this.show();
      return;
    }

    this.loadAndShow();
  }

  public dispose(): void {
    this.inspector?.dispose();
    this.inspector = undefined;
  }

  private loadAndShow(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;

    void import("@babylonjs/inspector")
      .then(({ ShowInspector }) => {
        this.showInspector = ShowInspector;
        this.show();
      })
      .finally(() => {
        this.loading = false;
      });
  }

  private show(): void {
    if (this.showInspector) {
      this.inspector = this.showInspector(this.scene);
    }
  }
}
