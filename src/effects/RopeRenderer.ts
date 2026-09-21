import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { Rope } from "../entities/Rope";

const MATRIX_SIZE = 16;
const MIN_SEGMENT_LENGTH = 1e-4;

/**
 * Отрисовка верёвки: между соседними точками — цилиндр, повёрнутый вдоль отрезка.
 * Все отрезки — thin instances одного единичного цилиндра, буфер матриц выделен заранее.
 */
export class RopeRenderer {
  private readonly rope: Rope;
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private readonly matrices: Float32Array;
  private readonly segmentCount: number;

  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly direction = new Vector3();
  private readonly middle = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly transform = new Matrix();

  public constructor(scene: Scene, rope: Rope) {
    this.rope = rope;
    this.segmentCount = rope.pointCount - 1;

    // Единичный цилиндр вдоль Y: длину и толщину задаёт матрица каждого отрезка.
    this.mesh = CreateCylinder("rope", { height: 1, diameter: 1, tessellation: 6 }, scene);
    this.mesh.isPickable = false;
    // Габариты исходного цилиндра не описывают верёвку — без этого её отсекает frustum culling.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.material = new StandardMaterial("rope-material", scene);
    this.material.diffuseColor = GameConfig.rope.color;
    this.material.specularColor.setAll(0);
    this.mesh.material = this.material;

    this.matrices = new Float32Array(this.segmentCount * MATRIX_SIZE);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrices, MATRIX_SIZE, false);
    this.mesh.thinInstanceCount = 0;
  }

  public update(): void {
    if (!this.rope.isActive) {
      this.mesh.thinInstanceCount = 0;
      return;
    }

    this.rope.copyPointTo(0, this.start);
    for (let i = 0; i < this.segmentCount; i++) {
      this.rope.copyPointTo(i + 1, this.end);
      this.writeSegment(i);
      this.start.copyFrom(this.end);
    }

    this.mesh.thinInstanceCount = this.segmentCount;
    this.mesh.thinInstanceBufferUpdated("matrix");
  }

  /** Матрица отрезка start→end: масштаб по длине, поворот оси Y на направление, перенос в середину. */
  private writeSegment(index: number): void {
    const thickness = GameConfig.rope.thickness;

    this.end.subtractToRef(this.start, this.direction);
    const length = this.direction.length();

    if (length > MIN_SEGMENT_LENGTH) {
      this.direction.scaleInPlace(1 / length);
      Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this.direction, this.rotation);
    } else {
      this.rotation.set(0, 0, 0, 1);
    }

    this.start.addToRef(this.end, this.middle).scaleInPlace(0.5);
    this.scale.set(thickness, length, thickness);

    Matrix.ComposeToRef(this.scale, this.rotation, this.middle, this.transform);
    this.transform.copyToArray(this.matrices, index * MATRIX_SIZE);
  }

  public dispose(): void {
    this.material.dispose();
    this.mesh.dispose();
  }
}
