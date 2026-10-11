# Agroville — MVP 0.1

Small browser-based pixel-art cattle-farm simulator. The MVP lets you select animals, explore the map, change diet, supplement, location, and weather, and compare pasture with confinement over 30 illustrative days. The comparison holds diet, supplement, weather, and starting state constant so housing is the only changed factor. It reports modeled dry-matter intake and per-paddock forage stock alongside weight and feed cost.

## Run locally

Requires Node.js 20 or newer. From this directory:

```bash
npm start
```

Open http://localhost:8000. The built-in server serves the app and an optional explanation endpoint. Web Workers and JavaScript modules require HTTP; opening `index.html` via `file://` will not work. A static host can still serve the simulator and the explanation button will use its local deterministic fallback.

### Optional AI explanations

The simulation engine runs locally and never calls an AI provider. The separate `/api/explain` endpoint accepts only validated scenario settings and aggregate metrics. By default it returns a deterministic explanation and requires no key or network. To enable OpenAI explanations, set `OPENAI_API_KEY` on the server and start it with `LLM_PROVIDER=openai`; optionally set `OPENAI_MODEL` (default `gpt-6-luna`). The key is read only by the backend, is never sent to the browser, and is not logged. The provider receives no tools and cannot change the simulation. Provider errors and timeouts fall back to deterministic text.

Generated and fallback explanations are labeled “não medido”. They describe illustrative software assumptions and are not animal observations, measurements, or management advice. No action proposals are exposed or applied. The OpenAI Responses API supports bounded output via `max_output_tokens`; this integration caps replies at 160 tokens and sets `store: false`. Model availability can vary by API account; model names, limits, and token prices change over time. Check [the official models catalog](https://developers.openai.com/api/docs/models), [Responses API reference](https://developers.openai.com/api/reference/resources/responses/methods/create), and [current API pricing](https://developers.openai.com/api/docs/pricing) before enabling a provider. At the pricing page values checked on 2026-10-11, `gpt-6-luna` standard short-context rates were $0.05/1M input tokens and $0.25/1M output tokens; actual cost depends on input, reasoning, and account pricing.

Run the deterministic engine tests with Node.js:

```bash
npm test
```

## Project files

- `index.html`, `style.css` — responsive UI
- `app.js` — map rendering, controls, charts, and CSV export
- `engine.js` — deterministic farm simulation, per-animal activity history, and scenario comparison
- `worker.js` — simulation worker, isolated from rendering
- `tests/explanation.test.js` — validated optional explanation API and deterministic fallback
- `server.js` — static HTTP server and optional explanation API
- `tests/engine.test.js` — deterministic replay and single-factor comparison checks
- `docs/engenharia-reversa.md` — source evidence and REA availability notes
- `docs/proximo-mvp.md` — increment scope, assumptions, and next steps
- `docs/caso-zootecnico-demonstrativo.md` — current software case and expert decisions still needed
- `docs/parametros-e-fontes.md` — parameter assumptions, contextual references, and data/license status
- `docs/fontes-dados-candidatos.md` — data discovery and the recommended next prototype sequence

Project follow-up: [private GitHub issue tracker](https://github.com/santleme/riose-agro/issues).

Saved scenarios stay in browser storage. Comparison manifests export and validate the starting snapshot, seed, period, factor, and both configurations; the engine keeps model and locomotion randomness separate.

## Current limitations

This is an illustrative software prototype, not a validated livestock or nutrition model. Assumptions are in `engine.js`; results must not guide real animal-management decisions. No scientific dataset was used to calibrate or validate the assumptions. Behavior text comes from fixed state rules, not an LLM. Optional explanations can use a server-side provider but never change simulation values or apply actions. The map and sprites were drawn in code for this demo; the project uses the Smallville paper as interaction inspiration but does not copy its source or assets.

The inspector's activity history records simulated engine transitions and their rule inputs (hour, modeled thirst, and housing). It describes the software's rules, not observed animal behavior.

## Next step

Validate the interaction with users, select a well-defined cattle scenario, replace demonstration equations with documented and calibrated models, then test against independent measurements. Move simulation calculations to Rust/WebAssembly only if profiling shows that the JavaScript engine needs it.

Live demo: https://agro-smallville-mvp.qwdqwdwqdqdqwdwwqqw.chatgpt.site
