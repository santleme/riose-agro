# Agroville — MVP 0.1

Small browser-based pixel-art cattle-farm simulator. The MVP lets you select animals, explore the map, change diet, supplement, location, and weather, and compare pasture with confinement over 30 illustrative days. The comparison holds diet, supplement, weather, and starting state constant so housing is the only changed factor.

## Run locally

Requires Python 3 (or any static HTTP server). From this directory:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. Web Workers and JavaScript modules require HTTP; opening `index.html` via `file://` will not work.

Run the deterministic engine tests with Node.js:

```bash
npm test
```

## Project files

- `index.html`, `style.css` — responsive UI
- `app.js` — map rendering, controls, charts, and CSV export
- `engine.js` — deterministic farm simulation, per-animal activity history, and scenario comparison
- `worker.js` — simulation worker, isolated from rendering
- `tests/engine.test.js` — deterministic replay and single-factor comparison checks
- `docs/engenharia-reversa.md` — source evidence and REA availability notes
- `docs/proximo-mvp.md` — increment scope, assumptions, and next steps

Project follow-up: [private GitHub issue tracker](https://github.com/santleme/riose-agro/issues).

## Current limitations

This is an illustrative software prototype, not a validated livestock or nutrition model. Assumptions are in `engine.js`; results must not guide real animal-management decisions. No scientific dataset was used to calibrate or validate the assumptions. Behavior text comes from fixed state rules, not an LLM. The map and sprites were drawn in code for this demo; the project uses the Smallville paper as interaction inspiration but does not copy its source or assets.

The inspector's activity history records simulated engine transitions and their rule inputs (hour, modeled thirst, and housing). It describes the software's rules, not observed animal behavior.

## Next step

Validate the interaction with users, select a well-defined cattle scenario, replace demonstration equations with documented and calibrated models, then test against independent measurements. Move simulation calculations to Rust/WebAssembly only if profiling shows that the JavaScript engine needs it.

Live demo: https://agro-smallville-mvp.qwdqwdwqdqdqwdwwqqw.chatgpt.site
