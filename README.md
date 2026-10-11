# Agroville — MVP 0.1

Agroville is a small browser-based cattle-farm simulator with an institutional landing page. The home page introduces the project; **Explorar a fazenda** opens the pixel-art simulator, where you can select animals, explore the map, change diet, supplement, location, and weather, and compare two illustrative 30-day scenarios. Choose housing, diet, supplement, or weather as the single intervention; the current farm state is the baseline and only the selected configuration field changes. It reports modeled dry-matter intake and per-paddock forage stock alongside weight and feed cost.

## Run locally

Requires Node.js 20 or newer for the local server. From this directory:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 for the farm map and Scenario Studio. The optional project landing page is `home.html`; `simulator.html` remains a direct link to the same farm experience. Web Workers and JavaScript modules require HTTP; opening files via `file://` will not work. To use the local explanation endpoint and the **Revisar snapshot** panel, start the bundled server with `npm start`; the snapshot file is validated locally and is never applied to the current simulation. A static server can run the simulator but uses only deterministic explanations and does not provide the snapshot review API. The bundled server binds to loopback; exposing it on another host requires `ALLOW_REMOTE_ACCESS=true` because snapshot validation is unauthenticated.

### Optional scenario explanations

The farm engine stays local and deterministic. `/api/explain` receives validated scenario settings and aggregate metrics; its fallback requires no provider or API key. To enable an optional language-provider adapter, set `LLM_PROVIDER=openai|groq|huggingface` and its matching server-side key (`OPENAI_API_KEY`, `GROQ_API_KEY`, or `HF_TOKEN`) before `npm start`; select a model with `LLM_MODEL` or the provider-specific `OPENAI_MODEL`, `GROQ_MODEL`, or `HF_MODEL`. Keys stay on the server. With no provider/key, or if a provider fails, the deterministic explanation is used. Explanations cannot modify simulation results or apply actions and are labeled as not measured.

Open **Dados observados** in the header to explore the published calf trial as measurements, separate from the simulated adult beef herd. The normalized CC0 data snapshot is included so the page works offline. To regenerate it from Zenodo and verify the source-file MD5 checksums, run:

```bash
npm run build:observed-data
```

For a local post-decision record, open **Registrar resultado** from the map. The page reads the selected manifest, eligible linked farm snapshot, and archived output locally, then downloads the projection archive and outcome sidecar; no farm record is posted to the server. Archive a comparison with `npm run archive:comparison -- <manifest.json> <comparison-result.json>`. This includes hashes of the exact manifest bytes and `engine.js` and refuses to overwrite an existing archive. Link a domain snapshot with `npm run link:snapshot -- --snapshot <farm-snapshot.json> --manifest <manifest.json> --output <farm-snapshot-linked.json>`, then validate using `npm run validate:outcome -- <outcome.json> --archive <comparison-result.json> --manifest <manifest.json> --snapshot <farm-snapshot-linked.json>`. A descriptive difference is available only after snapshot, review, consent, access, execution, unit, horizon, quality, and outcome-alignment gates pass; the record never changes the archived projection or simulation parameters. The snapshot linkage verifies lot identity and herd size but does not prove that its fields were mapped into the current numerical engine. See [`docs/registro-desfecho.md`](docs/registro-desfecho.md).

Install the development dependencies once; the tests and snapshot validator use Ajv to check the JSON Schema:

```bash
npm install
```

Run the deterministic engine and data-contract tests with Node.js:

```bash
npm test
```

Validate a versioned farm snapshot against JSON Schema and cross-field provenance rules:

```bash
npm run validate:snapshot -- schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json
```

This example is structurally valid but is an observed study slice, not a farm baseline; simulation eligibility is `not-applicable`, and the missing start weight, individual DMI, and paddock area remain explicit. Add `--require-eligible` to make that state return exit code 2.

To create a snapshot copy linked to a comparison manifest, validate the original snapshot and exported manifesto and calculate the hash automatically:

```bash
npm run link:snapshot -- --snapshot farm-snapshot.json --manifest comparison.json --output farm-snapshot-linked.json
```

The command validates the manifest with the engine's existing rules, records the exact file SHA-256 without copying scenario fields, and refuses to overwrite the output. It rejects observed-study slices. Then validate the linked copy with `npm run validate:snapshot -- farm-snapshot-linked.json --manifest comparison.json`; the exact bytes must remain available. Linking does not make a snapshot eligible for simulation.

## Project files

- `index.html`, `style.css` — interactive cattle-farm simulator and Scenario Studio
- `home.html`, `home.css`, `home.js` — optional responsive project landing page
- `simulator.html` — direct link to the farm experience
- `assets/agroville-farm-worlds.png` — original generated hero illustration
- `app.js` — map rendering, controls, charts, and CSV export
- `engine.js` — deterministic farm simulation, per-animal activity history, and one-factor scenario comparison
- `worker.js` — simulation worker, isolated from rendering
- `server.js` — local static server and optional explanation endpoint
- `snapshot-review.js`, `snapshot-review.css` — read-only snapshot review panel; the local endpoint validates schema, provenance, readiness, and exact manifest linkage
- `tests/engine.test.js`, `tests/app.test.js`, `tests/comparison-presentation.test.js` — deterministic replay, Scenario Studio flow, and evidence presentation checks
- `tests/explanation.test.js` — explanation input validation and deterministic fallback
- `observed-data.html`, `observed-data.js`, `observed-data.css` — read-only explorer for the published calf trial
- `observed-data-model.js` — animal-weighted weekly summaries for the observed-data explorer
- `scripts/build_observed_calf_dataset.py` — standard-library importer that fetches and checksum-verifies the source XLSX files
- `data/observed-calves-zenodo-7251167.json` — normalized observations from the CC0 Zenodo record; not model output
- `tests/observed-data.test.js` — source snapshot, missingness, and animal-level summary checks
- `docs/engenharia-reversa.md` — source evidence and REA availability notes
- `docs/proximo-mvp.md` — increment scope, assumptions, and next steps
- `docs/caso-zootecnico-demonstrativo.md` — current software case and expert decisions still needed
- `docs/parametros-e-fontes.md` — parameter assumptions, contextual references, and data/license status
- `docs/fontes-dados-candidatos.md` — data discovery and the recommended next prototype sequence
- `docs/revisao-literatura-simile-agro-2026.md` — Simile/Smallville research, 2026 methods, livestock models, datasets, and limits
- `schemas/farm-snapshot.schema.json` and `schemas/examples/` — versioned farm-state contract with field-level provenance and a public USDA example
- `snapshot-validator.js` — cross-field checks that prevent missing required inputs from silently becoming simulation data
- `snapshot-manifest-link.js`, `scripts/link-farm-snapshot.js` — validate and attach an exact manifest digest to a new snapshot copy without duplicating scenario fields
- `scripts/validate-farm-snapshot.js` — command-line gate that runs JSON Schema and semantic checks together
- `docs/snapshot-fazenda.md` — snapshot contract, simulation eligibility, and known gaps
- `docs/politica-incerteza.md` — uncertainty sources, current non-calibrated state, and gating rules for future ranges
- `tests/farm-snapshot.test.js` — missing-data and provenance checks for the snapshot contract
- `schemas/outcome-record.schema.json`, `comparison-archive.js`, and `outcome-record.js` — local projection archive and post-decision outcome sidecar for #16
- `scripts/archive-comparison.js` and `scripts/validate-outcome-record.js` — reproducible archive and outcome-link validation commands
- `outcome-review.html`, `outcome-review.js`, `outcome-review.css` — browser-local post-decision capture and sidecar export
- `docs/registro-desfecho.md` and `tests/outcome-record.test.js` — outcome contract, limits, and review/consent/comparability checks
- `data/usda-cper/period.csv` — public-domain period outcomes from the USDA CPER study; retained for a validation-feasibility audit, not engine calibration
- `data/usda-cper/manifest.json` — DOI, license, direct source URLs, and pinned SHA-256 checksums for the archived period table and dictionary
- `scripts/audit_usda_cper_validation.py` — source hash checks, grouped mean baseline and exploratory cross-validated ADG model, with explicit engine-target compatibility report (`npm run audit:usda-cper`)
- `tests/usda-audit.test.js` — checks grouped holdout coverage and that the audit does not claim model validation
- `docs/engenharia-reversa.md` — evidence ledger for Smallville, Simile, REA static analysis, and runtime-observation limits

Project follow-up: [private GitHub issue tracker](https://github.com/santleme/riose-agro/issues).

## Current limitations

This is an illustrative software prototype, not a validated livestock or nutrition model. Assumptions are in `engine.js`; results must not guide real animal-management decisions. No scientific dataset was used to calibrate or validate the assumptions. Behavior text comes from fixed state rules, not an LLM. The map and sprites were drawn in code for this demo; the project uses the Smallville paper as interaction inspiration but does not copy its source or assets.

The inspector's activity history records simulated engine transitions and their rule inputs (hour, modeled thirst, and housing). It describes the software's rules, not observed animal behavior.

## Next step

Validate the interaction with users, select a well-defined cattle scenario, replace demonstration equations with documented and calibrated models, then test against independent measurements. Move simulation calculations to Rust/WebAssembly only if profiling shows that the JavaScript engine needs it.

Live demo: https://agro-smallville-mvp.qwdqwdwqdqdqwdwwqqw.chatgpt.site
