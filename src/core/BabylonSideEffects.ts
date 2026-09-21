/**
 * Side-effect импорты Babylon.js — единственное место в проекте.
 *
 * При точечных импортах (tree-shaking) часть функциональности не подключается сама:
 * методы регистрируются модулями, а шейдеры — кладутся в ShaderStore. Без этого либо
 * «X needs to be imported before», либо Babylon пытается дотянуть шейдер по HTTP,
 * получает от dev-сервера index.html и падает с «'<' : syntax error».
 *
 * Модуль импортируется первым в main.ts. Новую ловушку добавлять сюда, а не по месту.
 */

// Mesh.createInstance (пул бросаемых кубов)
import "@babylonjs/core/Meshes/instancedMesh";

// scene.enablePhysics и физика Physics V2
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent";

// Шейдеры StandardMaterial (GLSL для WebGL2 и WGSL для WebGPU)
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/ShadersWGSL/default.vertex";
import "@babylonjs/core/ShadersWGSL/default.fragment";
