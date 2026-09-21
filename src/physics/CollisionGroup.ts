/**
 * Группы коллизий Havok (битовые маски). Каждое тело обязано иметь свою группу:
 * по умолчанию membership — «все биты», и фильтр по маскам тогда не работает.
 */
export enum CollisionGroup {
  Ground = 1 << 0,
  Player = 1 << 1,
  Wall = 1 << 2,
  Cube = 1 << 3,
}

/** Статичное окружение: то, во что упирается прицел. */
export const ENVIRONMENT_GROUPS = CollisionGroup.Ground | CollisionGroup.Wall;
