# Fazenda piloto

`scene.json` is the declarative scene contract used by `src/client/farm-scene.js`. World coordinates, asset references, object order, and camera limits are independent of the scientific simulation engine. PixiJS only draws the scene; the what-if panel calls the existing local simulation engine separately.

The scene uses the selected pilot asset kit recorded in `assets/pilots/cattle-ranch-v1/pilot.json` on the integrated visual branch. The user approved the visual art of those 12 pilot assets and the composed pilot scene on 2026-10-13. That art review does not grant public or commercial release rights, approve a global style lock, or validate the simulation model. The new barn sprite was generated for this scene and has not received a separate art review.

The terrain image is a single illustrated ground plate. Its shrubs and vegetation are part of that plate; repeated tiling is not used. Scene objects are separate PNG assets and can be repositioned by editing `scene.json`.

PixiJS v8.22.0 is bundled locally in `vendor/pixi.min.mjs` under its included MIT license. This keeps the renderer independent of an external CDN at runtime.
