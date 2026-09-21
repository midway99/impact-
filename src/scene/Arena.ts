import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";

/** Окружение сцены: камера, свет и пол. Игровых сущностей не знает. */
export class Arena {
  private readonly camera: ArcRotateCamera;
  private readonly sun: DirectionalLight;
  private readonly ambient: HemisphericLight;
  private readonly ground: Mesh;
  private readonly groundBody: PhysicsAggregate;

  public constructor(scene: Scene, canvas: HTMLCanvasElement) {
    const { camera, light, ground } = GameConfig;

    this.camera = new ArcRotateCamera(
      "camera",
      camera.alpha,
      camera.beta,
      camera.radius,
      camera.target,
      scene,
    );
    this.camera.lowerRadiusLimit = camera.minRadius;
    this.camera.upperRadiusLimit = camera.maxRadius;
    this.camera.wheelDeltaPercentage = 0.02;
    this.camera.attachControl(canvas, true);

    this.sun = new DirectionalLight("sun", light.direction, scene);
    this.sun.intensity = light.intensity;

    this.ambient = new HemisphericLight("ambient", light.ambientDirection, scene);
    this.ambient.intensity = light.ambientIntensity;

    this.ground = CreateGround("ground", { width: ground.size, height: ground.size }, scene);

    const groundMaterial = new StandardMaterial("ground-material", scene);
    groundMaterial.diffuseColor = ground.color;
    groundMaterial.specularColor.setAll(0);
    this.ground.material = groundMaterial;

    // BodyConfig совпадает по форме с параметрами агрегата — параметры не дублируем.
    this.groundBody = new PhysicsAggregate(this.ground, PhysicsShapeType.BOX, ground.body, scene);
  }

  public get viewCamera(): ArcRotateCamera {
    return this.camera;
  }

  public get groundMesh(): Mesh {
    return this.ground;
  }

  public dispose(): void {
    this.groundBody.dispose();
    this.ground.material?.dispose();
    this.ground.dispose();
    this.ambient.dispose();
    this.sun.dispose();
    this.camera.dispose();
  }
}
