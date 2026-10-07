import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { IPhysicsCollisionEvent } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Nullable } from "@babylonjs/core/types";

import { GameConfig } from "../core/GameConfig";

/**
 * Куб, достаточно сильно ударившийся о преграду, примерзает к ней: тело становится статичным.
 * Havok присылает события уже после шага мира, поэтому тип тела меняется прямо в колбэке.
 *
 * Заодно запоминает верх преграды: только здесь известно, за что именно зацепился куб,
 * а рывку это нужно, чтобы отличить кромку уступа от середины стены.
 */
export class ImpactFreezer {
  private readonly physics: HavokPlugin;
  private readonly observer: Nullable<Observer<IPhysicsCollisionEvent>>;
  private top: number | null = null;

  private readonly handleCollision = (event: IPhysicsCollisionEvent): void => {
    const { impactImpulseThreshold, freezeOnGroups } = GameConfig.throwable;
    const hitGroups = event.collidedAgainst.shape?.filterMembershipMask ?? 0;

    // Слабое касание — не удар: иначе куб прилипнет, просто прикатившись к стене.
    if (event.impulse < impactImpulseThreshold || (hitGroups & freezeOnGroups) === 0) {
      return;
    }

    event.collider.setLinearVelocity(Vector3.ZeroReadOnly);
    event.collider.setAngularVelocity(Vector3.ZeroReadOnly);
    event.collider.setMotionType(PhysicsMotionType.STATIC);
    // Габариты осевые, поэтому для повёрнутого тела это верх его бокса, а не самой поверхности.
    // Считаем на удар, а не в кадре: getBoundingBox создаёт объект.
    this.top = event.collidedAgainst.getBoundingBox().maximumWorld.y;
  };

  public constructor(physics: HavokPlugin) {
    this.physics = physics;
    this.observer = physics.onCollisionObservable.add(this.handleCollision);
  }

  /**
   * Верх преграды последнего примерзания, м, или `null`, пока его не было.
   * Крепление появляется только вслед за примерзанием, поэтому для действующего
   * крюка это всегда верх того тела, за которое он держится.
   */
  public get surfaceTop(): number | null {
    return this.top;
  }

  public dispose(): void {
    this.physics.onCollisionObservable.remove(this.observer);
  }
}
