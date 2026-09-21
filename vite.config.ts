import { defineConfig } from "vite";

export default defineConfig({
  server: { open: true },
  // Havok тянет wasm сам — пре-бандл esbuild ломает путь до файла.
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  build: { target: "es2022", sourcemap: true },
});
