import "./style.css";

import { Game } from "./core/Game";

const canvas = document.getElementById("render-canvas");

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Canvas #render-canvas not found");
}

const game = new Game(canvas);

game.start();

window.addEventListener("beforeunload", () => game.dispose());
