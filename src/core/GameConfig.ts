import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface CameraConfig {
  readonly alpha: number;
  readonly beta: number;
  readonly radius: number;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly target: Vector3;
}

export interface LightConfig {
  readonly direction: Vector3;
  readonly intensity: number;
  readonly ambientDirection: Vector3;
  readonly ambientIntensity: number;
}

export interface GroundConfig {
  readonly size: number;
  readonly color: Color3;
}

export interface SceneConfig {
  readonly clearColor: Color3;
  readonly gravity: Vector3;
  readonly camera: CameraConfig;
  readonly light: LightConfig;
  readonly ground: GroundConfig;
}

/** Единственный источник констант сцены: в коде «магических» чисел быть не должно. */
export const GameConfig: SceneConfig = {
  clearColor: new Color3(0.043, 0.051, 0.071),
  gravity: new Vector3(0, -9.81, 0),
  camera: {
    alpha: -Math.PI / 2,
    beta: Math.PI / 3,
    radius: 18,
    minRadius: 6,
    maxRadius: 60,
    target: new Vector3(0, 1, 0),
  },
  light: {
    direction: new Vector3(-0.4, -1, -0.6),
    intensity: 1.1,
    ambientDirection: new Vector3(0, 1, 0),
    ambientIntensity: 0.35,
  },
  ground: {
    size: 40,
    color: new Color3(0.18, 0.2, 0.24),
  },
};
