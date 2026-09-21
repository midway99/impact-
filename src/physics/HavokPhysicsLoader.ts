import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
// WASM отдаём через ?url: Vite кладёт файл в сборку и возвращает рабочий путь.
// Без этого Havok ищет HavokPhysics.wasm рядом с бандлом и падает в production.
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";

/** Загрузка Havok WASM. Знает только про движок физики: сцену не трогает. */
export class HavokPhysicsLoader {
  public static async load(): Promise<HavokPlugin> {
    const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });

    return new HavokPlugin(true, havok);
  }
}
