const SVG_NS = "http://www.w3.org/2000/svg";
const GAUGE_CLASS = "charge-gauge";
const VISIBLE_CLASS = "is-visible";
const FULL_CLASS = "is-full";
/** Нормированная длина дуги: заполнение задаётся прямо в процентах. */
const TRACK_LENGTH = 100;
/** Ступеней заполнения: писать в DOM чаще незачем, разницы не видно. */
const STEPS = 50;
const RING_CENTRE = 50;
const RING_RADIUS = 42;

/**
 * Кольцо силы броска в центре экрана: появляется на нажатие клавиши и заполняется,
 * пока игрок её держит. Вне набора экран чистый.
 *
 * SVG в DOM, а не Babylon GUI: HUD здесь и так на DOM, и ради одной дуги тянуть
 * зависимость незачем. Геометрия кольца нормирована через `pathLength`, поэтому
 * размер и цвета живут целиком в CSS — отсюда идёт только заполнение.
 */
export class ChargeGauge {
  private readonly root: SVGSVGElement;
  private readonly fill: SVGCircleElement;

  private step = -1;
  private visible = false;
  private full = false;

  public constructor(parent: HTMLElement) {
    this.root = document.createElementNS(SVG_NS, "svg");
    this.root.setAttribute("class", GAUGE_CLASS);
    this.root.setAttribute("viewBox", `0 0 ${RING_CENTRE * 2} ${RING_CENTRE * 2}`);
    // Кольцо ничего не сообщает программе чтения с экрана: заряд слышен по звуку броска.
    this.root.setAttribute("aria-hidden", "true");

    this.root.appendChild(ChargeGauge.createRing(`${GAUGE_CLASS}__track`));
    this.fill = ChargeGauge.createRing(`${GAUGE_CLASS}__fill`);
    this.fill.setAttribute("pathLength", String(TRACK_LENGTH));
    this.root.appendChild(this.fill);

    parent.appendChild(this.root);
  }

  private static createRing(className: string): SVGCircleElement {
    const circle = document.createElementNS(SVG_NS, "circle");

    circle.setAttribute("class", className);
    circle.setAttribute("cx", String(RING_CENTRE));
    circle.setAttribute("cy", String(RING_CENTRE));
    circle.setAttribute("r", String(RING_RADIUS));

    return circle;
  }

  /**
   * `power` — заряд 0..1, `charging` — держит ли игрок клавишу.
   * Вызывается каждый кадр, поэтому в DOM пишет только при настоящем изменении.
   */
  public update(power: number, charging: boolean): void {
    if (charging !== this.visible) {
      this.visible = charging;
      this.root.classList.toggle(VISIBLE_CLASS, charging);
    }

    // Дугу обнуляем и в скрытом виде: следующий набор должен начаться с пустого кольца,
    // иначе оно проявится уже заполненным от прошлого броска.
    const filled = charging ? power : 0;
    const step = Math.round(filled * STEPS);

    if (step !== this.step) {
      this.step = step;
      this.fill.style.strokeDashoffset = String(TRACK_LENGTH - (TRACK_LENGTH * step) / STEPS);
    }

    const full = filled >= 1;

    if (full !== this.full) {
      this.full = full;
      this.root.classList.toggle(FULL_CLASS, full);
    }
  }

  public dispose(): void {
    this.root.remove();
  }
}
