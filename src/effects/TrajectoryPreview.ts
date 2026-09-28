import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { IRaycastQuery } from "@babylonjs/core/Physics/physicsRaycastResult";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import type { ThrowAim } from "../input/ThrowAim";
import { ENVIRONMENT_GROUPS } from "../physics/CollisionGroup";

const MATRIX_SIZE = 16;

/**
 * Пунктир траектории броска до первого препятствия.
 * Точки — thin instances одной сферы: один draw call, буфер матриц выделен заранее.
 */
export class TrajectoryPreview {
  private readonly physics: HavokPlugin;
  private readonly aim: ThrowAim;
  private readonly dot: Mesh;
  private readonly material: StandardMaterial;
  private readonly matrices: Float32Array;

  private readonly hit = new PhysicsRaycastResult();
  /** Лучи видят только окружение: верёвка, кубы и сам персонаж не обрывают прицел. */
  private readonly query: IRaycastQuery = { collideWith: ENVIRONMENT_GROUPS };
  private readonly point = new Vector3();
  private readonly previous = new Vector3();
  private readonly transform = new Matrix();

  public constructor(scene: Scene, physics: HavokPlugin, aim: ThrowAim) {
    const { dotCount, dotRadius, color } = GameConfig.trajectory;

    this.physics = physics;
    this.aim = aim;

    this.dot = CreateSphere("trajectory-dot", { diameter: dotRadius * 2, segments: 4 }, scene);
    this.dot.isPickable = false;
    // Габариты исходной сферы не описывают пунктир — без этого его отсекает frustum culling.
    this.dot.alwaysSelectAsActiveMesh = true;

    // Неосвещённый материал: пунктир одинаково читается и на свету, и в тени.
    this.material = new StandardMaterial("trajectory-material", scene);
    this.material.emissiveColor = color;
    this.material.disableLighting = true;
    this.dot.material = this.material;

    this.matrices = new Float32Array(dotCount * MATRIX_SIZE);
    this.dot.thinInstanceSetBuffer("matrix", this.matrices, MATRIX_SIZE, false);
    this.dot.thinInstanceCount = 0;
  }

  public update(): void {
    const count = this.traceDots();

    this.dot.thinInstanceCount = count;
    this.dot.thinInstanceBufferUpdated("matrix");
  }

  private traceDots(): number {
    const { dotCount, timeStep } = GameConfig.trajectory;

    this.previous.copyFrom(this.aim.origin);

    for (let i = 0; i < dotCount; i++) {
      this.pointAt((i + 1) * timeStep, this.point);
      this.physics.raycast(this.previous, this.point, this.hit, this.query);

      if (this.hit.hasHit) {
        // Последняя точка — ровно в месте попадания.
        this.writeDot(i, this.hit.hitPointWorld);
        return i + 1;
      }

      this.writeDot(i, this.point);
      this.previous.copyFrom(this.point);
    }

    return dotCount;
  }

  /** Позиция в момент t: p = p0 + v·t + g·t²/2 — та же баллистика, что у тела без сопротивления. */
  private pointAt(time: number, result: Vector3): void {
    const gravityFactor = (time * time) / 2;

    this.aim.velocity.scaleToRef(time, result);
    result.addInPlace(this.aim.origin);
    GameConfig.gravity.scaleAndAddToRef(gravityFactor, result);
  }

  private writeDot(index: number, position: Vector3): void {
    Matrix.TranslationToRef(position.x, position.y, position.z, this.transform);
    this.transform.copyToArray(this.matrices, index * MATRIX_SIZE);
  }

  public dispose(): void {
    this.material.dispose();
    this.dot.dispose();
  }
}
