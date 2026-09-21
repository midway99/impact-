import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

/** Оси камеры в плоскости пола — общий расчёт для движения и броска. */
export class CameraAxes {
  /** Локальная ось камеры в мировых координатах, без вертикали и нормализованная. Пишет в `result`. */
  public static groundAxisToRef(camera: Camera, localAxis: Vector3, result: Vector3): Vector3 {
    camera.getDirectionToRef(localAxis, result);
    result.y = 0;

    return result.normalize();
  }
}
