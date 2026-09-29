import "./style.css";
import "./core/BabylonSideEffects";

import { Game } from "./core/Game";
import { HavokPhysicsLoader } from "./physics/HavokPhysicsLoader";

const canvas = document.getElementById("render-canvas");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Canvas #render-canvas not found");
}

const physics = await HavokPhysicsLoader.load();
const game = new Game(canvas, physics);

game.start();

window.addEventListener("beforeunload", () => game.dispose());
