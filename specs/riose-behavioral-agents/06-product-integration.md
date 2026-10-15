# Product V2 integration & interaction rules

## Progressive disclosure
- Product V2 remains the primary prompt -> review -> run -> population -> inspect flow.
- Add a research-only `Behavior` view when real versioned generated sequences are available; otherwise show `Not yet validated / no eligible model`.
- Preserve stable animal identity, time controls, baseline/intervention pairing and old history. Do not mix generated Perea-ontology actions with demo engine actions without explicit labels.
- Model/evidence drawer: source, DOI, dataset rights, population, behavioral ontology, validation category, known failure modes and version.
- Compare *empirical cohort vs generated* as a separate research assessment. Never imply Perea animals are the same as Product's synthetic Nelore herd.

## Apple-like design constraints
- White/off-white canvas, soft neutrals and calm blue scientific highlights; spacious layout, high-contrast typography, monospaced/tabular numerics where helpful.
- Avoid game-like map, sprites, unnecessary 3D/graphics dependencies and dense dashboards.
- Tiny meaningful transitions for changed state and selection; motion defaults ~120–240 ms where appropriate, disable via `prefers-reduced-motion`.
- Charts display actual numeric data; never animate made-up intermediate measurements.
- Accessible keyboard selection, visible focus, legends not reliant on hue, mobile inspector/panel handling.

## Acceptance for UI milestone
E2E verifies mode label, provenance and opt-in, selected animal matching, no scientific fields invented, model-unavailable state, desktop/mobile overflow, reduced motion, and rollback to legacy engine outputs. Screenshots inspected in browser before DONE.
