/**
 * Состояние клавиш по физическим кодам (KeyW и т.п.): раскладка и регистр не влияют.
 * Подписки создаются один раз, в кадре только проверка `isPressed`.
 */
export class KeyboardState {
  private readonly pressed = new Set<string>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  /** Потеря фокуса окна: keyup не придёт, иначе клавиша «залипнет» нажатой. */
  private readonly handleBlur = (): void => {
    this.pressed.clear();
  };

  public constructor() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  public isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.pressed.clear();
  }
}
