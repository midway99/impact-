import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  PhysicsConstraintAxis,
  PhysicsMotionType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint";
import type { PhysicsConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint";
import { PhysicsShapeSphere } from "@babylonjs/core/Physics/v2/physicsShape";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";

import { GameConfig } from "../core/GameConfig";
import { BodyTeleport } from "../physics/BodyTeleport";
import { CollisionGroup, ENVIRONMENT_GROUPS } from "../physics/CollisionGroup";
import type { Player } from "./Player";

/** Соединения верёвки с одним кубом пула. */
interface CubeBinding {
  /** Последнее звено ↔ куб: верёвка визуально заканчивается на кубе. */
  readonly tether: PhysicsConstraint;
  /**
   * Персонаж ↔ куб на полную длину верёвки. Предел держится за один проход решателя:
   * длинная цепочка звеньев за шаг не сходится, растягивается и потом отдачей швыряет куб назад.
   */
  readonly leash: PhysicsConstraint;
}

interface RopeChain {
  readonly nodes: readonly TransformNode[];
  readonly bodies: readonly PhysicsBody[];
  readonly links: readonly PhysicsConstraint[];
  readonly last: PhysicsBody;
}

/**
 * Верёвка: цепочка лёгких шариков-звеньев. Соседей держит ограничение «расстояние от 0 до длины звена»,
 * поэтому верёвка провисает, но не растягивается. Первое звено привязано к персонажу, последнее — к кубу,
 * а общую длину дополнительно держит прямая страховочная связь персонаж ↔ куб.
 * Все соединения создаются заранее; в игре они только включаются и выключаются.
 */
export class Rope {
  private readonly physics: HavokPlugin;
  private readonly player: Player;
  private readonly shape: PhysicsShapeSphere;
  private readonly nodes: readonly TransformNode[];
  private readonly bodies: readonly PhysicsBody[];
  private readonly links: readonly PhysicsConstraint[];
  /** Готовые соединения с каждым кубом пула. */
  private readonly bindings = new Map<PhysicsBody, CubeBinding>();

  private binding: CubeBinding | null = null;
  private target: TransformNode | null = null;
  private active = false;

  private readonly anchor = new Vector3();
  private readonly point = new Vector3();
  private readonly velocity = new Vector3();

  public constructor(scene: Scene, physics: HavokPlugin, player: Player, targets: readonly PhysicsBody[]) {
    this.physics = physics;
    this.player = player;

    // Одна форма на все звенья: верёвка цепляется за окружение, но не за себя, персонажа и кубы.
    this.shape = new PhysicsShapeSphere(Vector3.Zero(), GameConfig.rope.radius, scene);
    this.shape.filterMembershipMask = CollisionGroup.Rope;
    this.shape.filterCollideMask = ENVIRONMENT_GROUPS;

    const chain = this.buildChain(scene);
    this.nodes = chain.nodes;
    this.bodies = chain.bodies;
    this.links = chain.links;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (target) {
        this.bindings.set(target, this.createBinding(chain.last, target));
      }
    }

    this.park();
  }

  public get isActive(): boolean {
    return this.active;
  }

  /** Точки для отрисовки: якорь на персонаже, звенья, привязанный куб. */
  public get pointCount(): number {
    return this.nodes.length + 2;
  }

  public copyPointTo(index: number, result: Vector3): void {
    if (index === 0) {
      this.anchorToRef(result);
      return;
    }

    const node = this.nodes[index - 1];
    if (node) {
      result.copyFrom(node.position);
    } else if (this.target) {
      result.copyFrom(this.target.position);
    }
  }

  /** Бросок: звенья выстраиваются от руки до точки вылета и летят вслед за кубом. */
  public launch(origin: Vector3, velocity: Vector3, target: PhysicsBody): void {
    const count = this.bodies.length;

    this.anchorToRef(this.anchor);

    for (let i = 0; i < count; i++) {
      const body = this.bodies[i];
      const node = this.nodes[i];
      if (!body || !node) {
        continue;
      }

      // Звено ближе к кубу летит быстрее: верёвка разматывается, а не летит комом.
      const share = (i + 1) / (count + 1);
      Vector3.LerpToRef(this.anchor, origin, share, this.point);
      velocity.scaleToRef(share, this.velocity);

      body.setMotionType(PhysicsMotionType.DYNAMIC);
      BodyTeleport.toPosition(this.physics, body, node, this.point);
      body.setLinearVelocity(this.velocity);
    }

    this.setLinksEnabled(true);
    this.attach(target);
    this.active = true;
  }

  /** Привязка к новому кубу; прежний отпускается. */
  private attach(target: PhysicsBody): void {
    Rope.setBindingEnabled(this.binding, false);
    this.binding = this.bindings.get(target) ?? null;
    Rope.setBindingEnabled(this.binding, true);
    this.target = target.transformNode;
  }

  private static setBindingEnabled(binding: CubeBinding | null, enabled: boolean): void {
    if (binding) {
      binding.tether.isEnabled = enabled;
      binding.leash.isEnabled = enabled;
    }
  }

  private createBinding(last: PhysicsBody, target: PhysicsBody): CubeBinding {
    const { segmentCount, segmentLength, anchorOffset } = GameConfig.rope;
    const fullLength = (segmentCount + 1) * segmentLength;

    return {
      tether: Rope.createLink(last, target, Vector3.Zero(), segmentLength),
      leash: Rope.createLink(this.player.physicsBody, target, anchorOffset.clone(), fullLength),
    };
  }

  /** До первого броска верёвки нет: звенья статичны и спрятаны под полом, соединения выключены. */
  private park(): void {
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      const node = this.nodes[i];
      if (body && node) {
        body.setMotionType(PhysicsMotionType.STATIC);
        BodyTeleport.toPosition(this.physics, body, node, GameConfig.parkPosition);
      }
    }

    this.setLinksEnabled(false);
    this.active = false;
  }

  private setLinksEnabled(enabled: boolean): void {
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      if (link) {
        link.isEnabled = enabled;
      }
    }
  }

  private anchorToRef(result: Vector3): void {
    this.player.position.addToRef(GameConfig.rope.anchorOffset, result);
  }

  private buildChain(scene: Scene): RopeChain {
    const { segmentCount, segmentLength, segmentMass, linearDamping, anchorOffset } = GameConfig.rope;
    const nodes = new Array<TransformNode>(segmentCount);
    const bodies = new Array<PhysicsBody>(segmentCount);
    const links = new Array<PhysicsConstraint>(segmentCount);

    let previous = this.player.physicsBody;
    let pivot = anchorOffset.clone();

    for (let i = 0; i < segmentCount; i++) {
      const node = new TransformNode(`rope-segment-${i}`, scene);
      node.position.copyFrom(GameConfig.parkPosition);

      const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
      body.shape = this.shape;
      body.setMassProperties({ mass: segmentMass });
      body.setLinearDamping(linearDamping);

      nodes[i] = node;
      bodies[i] = body;
      links[i] = Rope.createLink(previous, body, pivot, segmentLength);

      previous = body;
      pivot = Vector3.Zero();
    }

    return { nodes, bodies, links, last: previous };
  }

  /** Гибкая связь: расстояние между точками крепления от 0 до `maxDistance`. Создаётся выключенной. */
  private static createLink(
    parent: PhysicsBody,
    child: PhysicsBody,
    pivotOnParent: Vector3,
    maxDistance: number,
  ): PhysicsConstraint {
    const link = new Physics6DoFConstraint(
      { pivotA: pivotOnParent, pivotB: Vector3.Zero(), collision: false },
      [
        {
          axis: PhysicsConstraintAxis.LINEAR_DISTANCE,
          minLimit: 0,
          maxLimit: maxDistance,
        },
      ],
      parent.transformNode.getScene(),
    );

    parent.addConstraint(child, link);
    link.isEnabled = false;

    return link;
  }

  public dispose(): void {
    this.bindings.forEach((binding) => {
      binding.tether.dispose();
      binding.leash.dispose();
    });
    for (let i = 0; i < this.links.length; i++) {
      this.links[i]?.dispose();
    }
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i]?.dispose();
      this.nodes[i]?.dispose();
    }
    this.shape.dispose();
  }
}
