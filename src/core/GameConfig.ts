import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { CollisionGroup } from "../physics/CollisionGroup";

export interface RenderConfig {
  /** Сглаживание краёв. Дорого на слабых видеокартах. */
  readonly antialias: boolean;
  /**
   * Верхняя граница плотности пикселей. На экране с масштабом 200 % рендер без ограничения
   * идёт в четыре раза большем разрешении — самая частая причина просадок.
   */
  readonly maxPixelRatio: number;
}

export interface CameraConfig {
  /** Высота глаз над центром капсулы, м. */
  readonly eyeHeight: number;
  /** Чувствительность мыши: больше значение — медленнее поворот. */
  readonly angularSensibility: number;
  /** Предел взгляда вверх и вниз, рад. */
  readonly maxPitch: number;
  /** Ближняя плоскость отсечения, м. */
  readonly minZ: number;
}

export interface LightConfig {
  readonly direction: Vector3;
  readonly intensity: number;
  readonly ambientDirection: Vector3;
  readonly ambientIntensity: number;
}

/** Параметры физического тела. mass = 0 — статичное тело. */
export interface BodyConfig {
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
}

export interface GroundConfig {
  readonly size: number;
  readonly color: Color3;
  readonly body: BodyConfig;
}

export interface PlayerConfig {
  readonly height: number;
  readonly radius: number;
  readonly spawn: Vector3;
  readonly color: Color3;
  /** Скорость движения по полу, м/с. */
  readonly speed: number;
  readonly body: BodyConfig;
}

export interface WallConfig {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly color: Color3;
  readonly x: number;
  readonly z: number;
  readonly body: BodyConfig;
}

export interface ThrowableConfig {
  readonly size: number;
  readonly color: Color3;
  /** Сколько кубов одновременно в мире; при превышении переиспользуется самый старый. */
  readonly poolSize: number;
  /** Горизонтальная скорость броска, м/с. */
  readonly speed: number;
  /** Вертикальная скорость броска, м/с: даёт дугу. */
  readonly lift: number;
  /** Пауза между бросками, с. */
  readonly cooldown: number;
  /** Точка вылета: вперёд от центра персонажа и вверх, м. */
  readonly spawnForward: number;
  readonly spawnHeight: number;
  /** Ниже этого импульса удар считается касанием и куб не примерзает. */
  readonly impactImpulseThreshold: number;
  /** Маска групп, удар о которые примораживает куб. */
  readonly freezeOnGroups: number;
  readonly body: BodyConfig;
}

export interface TrajectoryConfig {
  /** Максимум точек пунктира; дуга обрывается раньше на первом препятствии. */
  readonly dotCount: number;
  readonly dotRadius: number;
  /** Шаг по времени между соседними точками, с. */
  readonly timeStep: number;
  readonly color: Color3;
}

export interface RopeConfig {
  /** Частиц верёвки, включая якорь на руке; прокси куба добавляется сверху. */
  readonly particleCount: number;
  /** Длина верёвки от руки до куба, м. */
  readonly length: number;
  /** Подшагов решателя на кадр: больше — жёстче и точнее верёвка. */
  readonly substeps: number;
  /** Радиус частицы для столкновений с полом и стеной, м. */
  readonly radius: number;
  /** Минимальное расстояние между несоседними участками верёвки, м; 0 — не проверять. */
  readonly selfDistance: number;
  /** Толщина отрисовки, м. */
  readonly thickness: number;
  /** Точек сплайна на одно звено: 1 — ломаная по частицам, больше — глаже. */
  readonly smoothing: number;
  /** Граней в сечении трубки. */
  readonly tessellation: number;
  readonly particleMass: number;
  /** Податливость растяжения, м/Н: 0 — нерастяжимая. */
  readonly stretchCompliance: number;
  /** Податливость изгиба, м/Н: больше — мягче верёвка. */
  readonly bendCompliance: number;
  /** Затухание скорости частиц, 1/с. */
  readonly damping: number;
  /** Трение о пол: доля горизонтального смещения, гасимая за подшаг (0..1). */
  readonly friction: number;
  /** Точка крепления на персонаже относительно его центра. */
  readonly anchorOffset: Vector3;
  readonly color: Color3;
  /** Блик. У витой верёвки он слабый и широкий: волокно почти не зеркалит. */
  readonly specular: Color3;
  /** Резкость блика: чем меньше, тем более рассеянный и матовый материал. */
  readonly specularPower: number;
}

export interface SceneConfig {
  readonly clearColor: Color3;
  readonly gravity: Vector3;
  /** Где лежат неиспользуемые физические тела из пулов: статичные, под полом. */
  readonly parkPosition: Vector3;
  readonly render: RenderConfig;
  readonly camera: CameraConfig;
  readonly light: LightConfig;
  readonly ground: GroundConfig;
  readonly player: PlayerConfig;
  readonly wall: WallConfig;
  readonly throwable: ThrowableConfig;
  readonly trajectory: TrajectoryConfig;
  readonly rope: RopeConfig;
}

/** Единственный источник констант сцены: в коде «магических» чисел быть не должно. */
export const GameConfig: SceneConfig = {
  clearColor: new Color3(0.043, 0.051, 0.071),
  gravity: new Vector3(0, -9.81, 0),
  parkPosition: new Vector3(0, -50, 0),
  render: {
    antialias: true,
    maxPixelRatio: 1,
  },
  camera: {
    eyeHeight: 0.6,
    angularSensibility: 800,
    maxPitch: 1.5,
    minZ: 0.1,
  },
  light: {
    direction: new Vector3(-0.45, -1, 0.6),
    intensity: 1.1,
    ambientDirection: new Vector3(0, 1, 0),
    ambientIntensity: 0.5,
  },
  ground: {
    size: 40,
    color: new Color3(0.18, 0.2, 0.24),
    body: { mass: 0, friction: 0.8, restitution: 0 },
  },
  player: {
    height: 2,
    radius: 0.5,
    spawn: new Vector3(-5, 1, 0),
    color: new Color3(0.35, 0.62, 0.95),
    speed: 7,
    body: { mass: 5, friction: 0.6, restitution: 0.05 },
  },
  wall: {
    width: 16,
    height: 3,
    depth: 2,
    color: new Color3(0.78, 0.35, 0.28),
    x: 0,
    z: 6,
    body: { mass: 0, friction: 0.5, restitution: 0.1 },
  },
  throwable: {
    size: 0.5,
    color: new Color3(0.95, 0.78, 0.3),
    poolSize: 12,
    speed: 16,
    lift: 3,
    cooldown: 0.2,
    spawnForward: 1.1,
    spawnHeight: 0.5,
    impactImpulseThreshold: 2,
    freezeOnGroups: CollisionGroup.Wall,
    body: { mass: 1, friction: 0.6, restitution: 0.2 },
  },
  trajectory: {
    dotCount: 40,
    dotRadius: 0.06,
    timeStep: 0.04,
    color: new Color3(1, 0.9, 0.45),
  },
  rope: {
    particleCount: 48,
    length: 7.5,
    substeps: 10,
    radius: 0.05,
    selfDistance: 0.05,
    thickness: 0.05,
    smoothing: 3,
    tessellation: 10,
    particleMass: 0.02,
    stretchCompliance: 0,
    // Трос гнётся втрое неохотнее верёвки. Меньше делать нельзя: изгиб начинает
    // спорить с растяжением, и трос перетягивается (при 0.0002 — до 9.6 м вместо 7.5).
    bendCompliance: 0.003,
    damping: 3.5,
    friction: 0.4,
    anchorOffset: new Vector3(0, 0.15, 0),
    color: new Color3(0.72, 0.61, 0.43),
    specular: new Color3(0.12, 0.11, 0.09),
    specularPower: 8,
  },
};
