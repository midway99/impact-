/**
 * Состояние клавиш по физическим кодам (KeyW и т.п.): раскладка и регистр не влияют.
 * Подписки создаются один раз, в кадре только проверки `isPressed` / `consumePress`.
 */
export class KeyboardState {
  /** Удерживаемые сейчас — для непрерывных действий (движение). */
  private readonly pressed = new Set<string>();
  /** Нажатые с момента последней проверки — для разовых действий (начало заряда броска). */
  private readonly unhandledPresses = new Set<string>();
  /** Отпущенные с момента последней проверки — для действий по отпусканию (сам бросок). */
  private readonly unhandledReleases = new Set<string>();

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    // Автоповтор зажатой клавиши — не новое нажатие.
    if (!event.repeat) {
      this.unhandledPresses.add(event.code);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
    this.unhandledReleases.add(event.code);
  };

  /** Потеря фокуса окна: keyup не придёт, иначе клавиша «залипнет» нажатой. */
  private readonly handleBlur = (): void => {
    this.pressed.clear();
    this.unhandledPresses.clear();
    // Отпускания тоже: уход из окна не должен сработать как отпускание клавиши.
    this.unhandledReleases.clear();
  };

  public constructor() {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  public isPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /**
   * Было ли нажатие с прошлой проверки; проверка его «съедает».
   * Ловит и короткий тап, когда keydown и keyup пришли между двумя кадрами.
   */
  public consumePress(code: string): boolean {
    return this.unhandledPresses.delete(code);
  }

  /** Было ли отпускание с прошлой проверки; проверка его «съедает». */
  public consumeRelease(code: string): boolean {
    return this.unhandledReleases.delete(code);
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.pressed.clear();
    this.unhandledPresses.clear();
    this.unhandledReleases.clear();
  }
}
