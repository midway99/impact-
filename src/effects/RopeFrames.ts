import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const AXIS = 3;

/**
 * Система координат вдоль кривой: в каждой точке пути — направление и две поперечные оси.
 *
 * Оси переносятся с предыдущей точки и лишь распрямляются поперёк нового направления
 * (parallel transport). Если в каждой точке брать произвольную перпендикулярную ось,
 * модель будет перекручивать на изгибах.
 *
 * Хранится в плоских массивах: в кадре нужны все точки сразу, объект на точку тут лишний.
 */
export class RopeFrames {
  public readonly count: number;
  public readonly tangents: Float32Array;
  public readonly normals: Float32Array;
  public readonly binormals: Float32Array;

  private readonly tangent = new Vector3();
  private readonly normal = new Vector3();
  private readonly binormal = new Vector3();

  public constructor(count: number) {
    this.count = count;
    this.tangents = new Float32Array(count * AXIS);
    this.normals = new Float32Array(count * AXIS);
    this.binormals = new Float32Array(count * AXIS);
  }

  /** Пересчитывает оси по текущему пути. Путь должен быть той же длины, что и при создании. */
  public update(path: readonly Vector3[]): void {
    for (let i = 0; i < this.count; i++) {
      this.readTangent(path, i);
      this.straightenNormal(i === 0);
      this.write(i);
    }
  }

  /** Направление пути в точке: по следующей точке, а для последней — по предыдущей. */
  private readTangent(path: readonly Vector3[], index: number): void {
    const last = this.count - 1;
    const current = path[index]!;
    const neighbour = index < last ? path[index + 1]! : path[index - 1]!;

    neighbour.subtractToRef(current, this.tangent);
    if (index === last) {
      this.tangent.scaleInPlace(-1);
    }
    if (this.tangent.lengthSquared() < 1e-12) {
      this.tangent.set(0, 0, 1);
    }
    this.tangent.normalize();
  }

  private straightenNormal(first: boolean): void {
    if (first) {
      // Первая точка: любая ось, не совпадающая с направлением.
      const upright = Math.abs(this.tangent.y) < 0.9;
      this.normal.set(upright ? 0 : 1, upright ? 1 : 0, 0);
    }

    this.tangent.scaleAndAddToRef(-Vector3.Dot(this.normal, this.tangent), this.normal);
    if (this.normal.lengthSquared() < 1e-12) {
      this.normal.set(this.tangent.y, -this.tangent.x, 0);
    }
    this.normal.normalize();
    // Порядок важен: тройка (normal, tangent, binormal) должна быть правой, иначе модель
    // переносится зеркально, у треугольников выворачивается обход и наружу смотрит изнанка.
    Vector3.CrossToRef(this.normal, this.tangent, this.binormal);
  }

  private write(index: number): void {
    const at = index * AXIS;

    this.tangents[at] = this.tangent.x;
    this.tangents[at + 1] = this.tangent.y;
    this.tangents[at + 2] = this.tangent.z;
    this.normals[at] = this.normal.x;
    this.normals[at + 1] = this.normal.y;
    this.normals[at + 2] = this.normal.z;
    this.binormals[at] = this.binormal.x;
    this.binormals[at + 1] = this.binormal.y;
    this.binormals[at + 2] = this.binormal.z;
  }
}
