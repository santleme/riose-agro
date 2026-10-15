# Agroville — MVP 0.1

Agroville is a small browser-based cattle-farm simulator with an institutional landing page. The home page introduces the project; **Explorar a fazenda** opens the pixel-art simulator, where you can select animals, explore the map, and set diet, supplement, housing, and weather. The current comparison runs two illustrative 30-day scenarios from the same farm snapshot and seed; its only intervention is housing, from pasture to confinement. Diet, supplement, and weather remain the same in both scenarios. It reports modeled dry-matter intake and per-paddock forage stock alongside weight and feed cost.

See the [repository layout guide](docs/architecture/repository-layout.md) for directory responsibilities and the reason browser page URLs remain at the root.

Completed and failed comparisons can be listed and replayed from the browser's local history. See [the local execution history guide](docs/historico-execucoes.md) for its storage, retention, and compatibility behavior.

## Run locally

Requires Node.js 20 or newer for the local server. From this directory:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 for the Riose landing page. Choose **product** or **View dashboard** to enter the farm experience at `product.html`; `simulator.html` redirects there for compatibility. The previous Agroville laboratory is preserved at `lab.html` for the manifesto's embedded simulation and specialist workflows. Web Workers and JavaScript modules require HTTP; opening files via `file://` will not work. To use the local explanation endpoint and the **Revisar snapshot** panel, start the bundled server with `npm start`; the snapshot file is validated locally and is never applied to the current simulation. A static server serves the landing and product experience without the local snapshot review API. The bundled server binds to loopback; exposing it on another host requires `ALLOW_REMOTE_ACCESS=true` because snapshot validation is unauthenticated.

The optional Rust/WASM metabolism prototype runs with `?engine=wasm` (for example `http://localhost:8000/?engine=wasm`). The default remains the existing JavaScript path because current browser-side measurements do not show a consistent end-to-end WASM gain. `npm run build:wasm` rebuilds the served module and requires the Rust `wasm32-unknown-unknown` target.

### Optional scenario explanations

The farm engine stays local and deterministic. `/api/explain` receives validated scenario settings and aggregate metrics; its fallback requires no provider or API key. To enable an optional language-provider adapter, set `LLM_PROVIDER=openai|groq|huggingface` and its matching server-side key (`OPENAI_API_KEY`, `GROQ_API_KEY`, or `HF_TOKEN`) before `npm start`; select a model with `LLM_MODEL` or the provider-specific `OPENAI_MODEL`, `GROQ_MODEL`, or `HF_MODEL`. Keys stay on the server. With no provider/key, or if a provider fails, the deterministic explanation is used. Explanations cannot modify simulation results or apply actions and are labeled as not measured.

Open **ADG e pastejo observados (USDA/CPER)** to explore animal-period ADG and grazing measures for the published yearling steers, or **Dados observados** to explore the separate published calf trial. Both pages show measurements separately from simulated results. Repeated animal IDs remain visible as repeated study periods, not independent animals. The USDA/CPER cohort is not labeled as mature cows; its fit to the approved “adult” product scope still needs independent zootechnical review.

An additional public USDA-ARS CPER dataset provides 1,283 individual yearling cattle seasons with entry/exit weights (2000–2019). Reproduce the file and unit audit with `npm run audit:usda-cper-ltgi`, then the fixed 2014–2018 engine ADG diagnostic with `npm run audit:engine-adg-cper-ltgi`. On the same 343 held-out steers, the engine's MAE is 0.414 kg/day versus 0.164 for a constant pre-2014 historical baseline; a weighing/shrink protocol change limits the baseline comparison. The CPER-trained ADG scale was also applied without refit to the public USDA-CGREC steers: MAE 0.222 over 291 records and 0.191 in 2015 (n=200), with high error in the small 1994 subset (n=14). These are exploratory component diagnostics: they do not align initial pasture biomass or all management inputs, support causal treatment claims, validate the full simulator, or calibrate production uncertainty.

The published Nellore feedlot workbook is archived separately under CC BY 4.0 in `data/mendeley-nellore-feedlot/`; it contains individual DMI, weights, drinking events, and weather from a distinct experiment. It is not mixed into the USDA/CPER grazing case. Run `npm run audit:mendeley-nellore` to verify its SHA-256 and report observed versus missing values, or `npm run audit:engine-dmi-mendeley` to compare the frozen default DMI rule against the 219 exact-date weight/DMI pairs. The report includes animal-cluster bootstrap intervals for the fixed-model error metrics; these are not prediction intervals or engine calibration. That narrow out-of-domain check is diagnostic and does not validate the adult grazing case or the full engine.

For a separate no-fit ADG component diagnostic on mature cows, `npm run audit:engine-adg-zenodo-cows` compares the frozen pasture output against ADG derived from the public Zenodo allometry cohort. It uses observed starting weight and an assumed 70-day interval, since exact individual dates and management inputs are absent. Keep the result separate from USDA/CPER; it is not full-engine validation or calibration.

The public UFMS/Mendeley v1 dataset is a separate cohort of 26 male Nelore around 20 months old, not mature cows. `npm run audit:ufms-nelore-grazing` verifies the CC BY 4.0 source; `npm run audit:engine-adg-ufms` runs a frozen no-fit ADG transfer diagnostic on 390 repeated animal-period rows, deriving ADG from endpoint weights and dates because 154 reported GMD values disagree. MAE is 0.449 kg/day (animal-cluster bootstrap metric-stability interval 0.418–0.482); this is not a prediction interval, independent holdout, or validation of the adult pasture scenario.

A second public CC BY source provides adult Angus cows on hay: [`data/sdsu-individual-dmi/`](data/sdsu-individual-dmi/). Its local audit separates group aggregates and the seven complete-case animal tags selected by the authors. Run `npm run audit:sdsu-individual-dmi` to regenerate the DMI derivation and quality report, and `npm run audit:engine-dmi-sdsu` for a fixed-default DMI component diagnostic. The latter uses 571 same-day positive-weight pairs (seven cows) and is out of the approved grazing domain; it is not full-engine validation, and no parameters are fit.

The normalized CC0 calf data snapshot is included so the calf page works offline. To regenerate it from Zenodo and verify the source-file MD5 checksums, run:

```bash
npm run build:observed-data
```

For a local post-decision record, open **Registrar resultado** from the map. The page reads the selected manifest, eligible linked farm snapshot, and archived output locally, then downloads the projection archive and outcome sidecar; no farm record is posted to the server. Archive a comparison with `npm run archive:comparison -- <manifest.json> <comparison-result.json>`. This includes hashes of the exact manifest bytes and `src/client/engine.js` and refuses to overwrite an existing archive. Link a domain snapshot with `npm run link:snapshot -- --snapshot <farm-snapshot.json> --manifest <manifest.json> --output <farm-snapshot-linked.json>`, then validate using `npm run validate:outcome -- <outcome.json> --archive <comparison-result.json> --manifest <manifest.json> --snapshot <farm-snapshot-linked.json>`. A descriptive difference is available only after snapshot, review, consent, access, execution, unit, horizon, quality, and outcome-alignment gates pass; the record never changes the archived projection or simulation parameters. The snapshot linkage verifies lot identity and herd size but does not prove that its fields were mapped into the current numerical engine. See [`docs/registro-desfecho.md`](docs/registro-desfecho.md).

Install the development dependencies once; the tests and snapshot validator use Ajv to check the JSON Schema:

```bash
npm install
```

Run the deterministic engine and data-contract tests with Node.js:

```bash
npm test
```

The supported CI toolchains and checks are documented in [docs/ci.md](docs/ci.md).

Run the preset scenario harness and write one `*.result.json` file per scenario:

```bash
npm run test:scenarios
```

Add a JSON file under `tests/scenarios/` to add a case; the runner discovers files without code changes. Each case declares an `engine` seed and animal count, optional `configuration`, `run.hours`, and JSON Pointer assertions over `/state` and `/metrics`. Supported operators are `equals`, `greaterThan`, `lessThan`, and `approximatelyEquals` (optional numeric `tolerance`). Results go to `.test-results/scenarios/`. To use another fixture and result directory, run `node scripts/experiments/run-scenarios.js <scenario-directory> <result-directory>`. Each invalid or failed case receives its own diagnostic result while other files still run. The harness checks reproducible engine behavior only; its assertions are not scientific validation.

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

## Scenario Composer

Open `/assets/scenario-editor/index.html` after running `npm start`. The Composer edits renderer-independent JSON scenes using the shared manifests and includes cut and dairy sample dioramas. Screenshots and Simile comparisons are stored under `public/assets/scenario-editor/previews/`.

## Project files

- `index.html` — compatibility redirect to `home.html`; the canonical project entry
- `home.html`, `src/client/home.css`, `src/client/home.js` — Riose landing page
- `product.html`, `src/client/product/` — canonical farm experience, scene model, renderer and page interaction
- `lab.html`, `src/client/style.css`, `src/client/app.js` — Agroville research laboratory and extended workflows
- `simulator.html` — compatibility redirect to `product.html`
- `assets/agroville-farm-worlds.png` — original generated hero illustration
- `src/client/app.js` — map rendering, controls, charts, and CSV export
- `src/client/engine.js`, `src/client/feeding-model.js` — deterministic farm simulation and extracted feeding calculation
- `src/client/scenario-presets.js` — versioned reproducible scenario catalog; see [`docs/catalogo-cenarios.md`](docs/catalogo-cenarios.md)
- `scripts/experiments/run-scenarios.js`, `schemas/scenario.schema.json`, `tests/scenarios/` — file-driven deterministic scenario execution, validation, result capture, and assertions
- `src/client/worker.js` — simulation worker, isolated from rendering
- `crates/riose-core/`, `src/client/metabolism-wasm.js`, `wasm/riose_core.wasm` — opt-in Rust/WASM batch kernel and JavaScript fallback; rebuild with `npm run build:wasm`
- `docs/architecture/` — repository/system audits, V2 boundaries, data contracts, decisions and measured migration plan
- `src/server/server.js` — local static server and optional explanation endpoint
- `src/client/snapshot-review.js`, `src/client/snapshot-review.css` — read-only snapshot review panel; the local endpoint validates schema, provenance, readiness, and exact manifest linkage
- `tests/engine.test.js`, `tests/app.test.js`, `tests/comparison-presentation.test.js` — deterministic replay, Scenario Studio flow, and evidence presentation checks
- `tests/explanation.test.js` — explanation input validation and deterministic fallback
- `observed-data.html`, `src/client/observed-data.js`, `src/client/observed-data.css` — read-only explorer for the published calf trial
- `adult-data.html`, `src/client/adult-data.js`, `src/client/adult-data.css`, `src/client/adult-data-model.js` — read-only ADG and grazing-measure explorer for USDA/CPER yearling-steer records; suitability for the “adult” product scope is pending review
- `rangeland-behavior.html`, `src/client/rangeland-behavior.js` — separate read-only prototype for public, video-annotated mature-cow behavior observations from New Mexico; no ADG/DMI or engine validation
- `adult-cow-data.html`, `src/client/adult-cow-data.js`, `src/client/adult-cow-data-model.js`, `src/client/adult-cow-data.css` — separate read-only explorer for the 27 adult cows in the public Zenodo grazing-allometry cohort; its 70-day ADG is explicitly derived and exploratory
- `grasscast-data.html`, `src/client/grasscast-data.js`, `src/client/grasscast-data.css` — separate historical CPER explorer for group-level ADG/ANPP pairs and independent NDVI, without engine calibration or causal claims
- `rothamsted-data.html`, `src/client/rothamsted-data.js`, `src/client/rothamsted-data.css` — separate read-only explorer for the public Rothamsted 2018–2025 young dairy-cross-beef cattle weight and plot-level herbage-mass cohort (CC BY 4.0); it does not validate the simulation engine
- `src/client/observed-data-model.js` — animal-weighted weekly summaries for the observed-data explorer
- `scripts/science/data_pipelines/build_observed_calf_dataset.py` — standard-library importer that fetches and checksum-verifies the source XLSX files
- `data/observed-calves-zenodo-7251167.json` — normalized observations from the CC0 Zenodo record; not model output
- `tests/observed-data.test.js` — source snapshot, missingness, and animal-level summary checks
- `docs/engenharia-reversa.md` — source evidence and REA availability notes
- `docs/modelos/interface-modelos-cientificos.md` — opt-in interface and adapter for scientific models
- `docs/proximo-mvp.md` — increment scope, assumptions, and next steps
- `docs/caso-zootecnico-demonstrativo.md` — current software case and expert decisions still needed
- `docs/parametros-e-fontes.md` — parameter assumptions, contextual references, and data/license status
- `docs/fontes-dados-candidatos.md` — data discovery and the recommended next prototype sequence
- `docs/revisao-literatura-simile-agro-2026.md` — Simile/Smallville research, 2026 methods, livestock models, datasets, and limits
- `schemas/farm-snapshot.schema.json` and `schemas/examples/` — versioned farm-state contract with field-level provenance and a public USDA example
- `src/client/snapshot-validator.js` — cross-field checks that prevent missing required inputs from silently becoming simulation data
- `src/client/snapshot-manifest-link.js`, `scripts/link-farm-snapshot.js` — validate and attach an exact manifest digest to a new snapshot copy without duplicating scenario fields
- `scripts/validate-farm-snapshot.js` — command-line gate that runs JSON Schema and semantic checks together
- `docs/snapshot-fazenda.md` — snapshot contract, simulation eligibility, and known gaps
- `docs/politica-incerteza.md` — uncertainty sources, current non-calibrated state, and gating rules for future ranges
- `tests/farm-snapshot.test.js` — missing-data and provenance checks for the snapshot contract
- `schemas/outcome-record.schema.json`, `src/client/comparison-archive.js`, and `src/client/outcome-record.js` — local projection archive and post-decision outcome sidecar for #16
- `scripts/archive-comparison.js` and `scripts/validate-outcome-record.js` — reproducible archive and outcome-link validation commands
- `outcome-review.html`, `src/client/outcome-review.js`, `src/client/outcome-review.css` — browser-local post-decision capture and sidecar export
- `docs/registro-desfecho.md` and `tests/outcome-record.test.js` — outcome contract, limits, and review/consent/comparability checks
- `data/usda-cper/period.csv` and `daily.csv` — public-domain yearling-steer ADG-by-period and daily grazing observations from USDA/CPER; used for read-only exploration, not engine calibration
- `data/perea-rangeland-behavior/` — Figshare v2 behavior labels and source README, CC BY 4.0; audit records repeated animal/timestamp rows and keeps this sample separate from USDA/CPER
- `data/usda-cper/manifest.json` — DOI, license, direct source URLs, and pinned SHA-256 checksums for both data tables and dictionaries
- `data/usda-grasscast/` and `scripts/science/source-audits/usda/audit_usda_grasscast.py` — public CPER/Grass-Cast historical gain, ANPP, NDVI files with pinned checksums; summaries remain group/site-level and separate from the individual 2019–2020 CPER cohort (`npm run audit:usda-grasscast`)
- `data/mendeley-nellore-feedlot/` — public CC BY 4.0 workbook and SHA-256 provenance manifest for a separate adult feedlot cohort
- `scripts/science/source-audits/audit_mendeley_nellore_feedlot.py`, `scripts/export_mendeley_nellore_dmi_weight_pairs.py`, `scripts/science/engine-audits/audit_engine_dmi_mendeley.js`, `tests/mendeley-nellore-audit.test.js` — checksum/coverage audit and fixed-default DMI component check for the separate Nellore feedlot cohort
- `data/sdsu-individual-dmi/`, `scripts/science/source-audits/audit_sdsu_individual_dmi.py`, `scripts/science/engine-audits/audit_engine_dmi_sdsu.js` — public supplement, selected-tag derivation, and fixed-default DMI diagnostic for a separate hay-fed Angus cohort
- `scripts/science/source-audits/usda/audit_usda_cper_validation.py` — source hash checks, grouped mean baseline and exploratory cross-validated ADG model, with explicit engine-target compatibility report (`npm run audit:usda-cper`)
- `scripts/science/source-audits/usda/audit_usda_cper_daily.py` — source hash, daily schema, coverage, duplicate animal-day, and codebook consistency audit (`npm run audit:usda-cper-daily`)
- `tests/usda-audit.test.js` — checks grouped holdout coverage and that the audit does not claim model validation
- `docs/engenharia-reversa.md` — evidence ledger for Smallville, Simile, REA static analysis, and runtime-observation limits

Project follow-up: [private GitHub issue tracker](https://github.com/santleme/riose-agro/issues).

## Current limitations

The separate [`rangeland-behavior.html`](rangeland-behavior.html) prototype explores CC BY 4.0 video-annotated behavior records from 24 mature cows. It contains no ADG, weight, or DMI and remains separate from the USDA/CPER analysis and simulation engine.

This is an illustrative software prototype, not a validated livestock or nutrition model. Assumptions are in `src/client/engine.js`; results must not guide real animal-management decisions. No scientific dataset has been used to calibrate the full engine. Public comparisons are scoped diagnostics only: CPER supports observed grazing/ADG exploration, Grass-Cast adds historical group/site-level grazing and forage context, and the Nellore feedlot and Angus hay checks measure one default DMI component in separate, out-of-domain cohorts. None validates the full model. Behavior text comes from fixed state rules, not an LLM. The map and sprites were drawn in code for this demo; the project uses the Smallville paper as interaction inspiration but does not copy its source or assets.

The inspector's activity history records simulated engine transitions and their rule inputs (hour, modeled thirst, and housing). It describes the software's rules, not observed animal behavior.

## Next step

Validate the interaction with users, select a well-defined cattle scenario, replace demonstration equations with documented and calibrated models, then test against independent measurements. Move simulation calculations to Rust/WebAssembly only if profiling shows that the JavaScript engine needs it.

Live demo: https://agro-smallville-mvp.qwdqwdwqdqdqwdwwqqw.chatgpt.site

Os exploradores de dados observados estão em [`adult-data.html`](adult-data.html) (USDA/CPER), [`rothamsted-data.html`](rothamsted-data.html), [`cgrec-data.html`](cgrec-data.html) (USDA CGREC 1989–2015) e [`hpgrs-data.html`](hpgrs-data.html) (USDA/ARS HPGRS 1982–2022). CPER, Rothamsted e HPGRS são coortes de animais jovens/yearlings, não de vacas maduras; cada fonte permanece separada e seus limites etários estão documentados. Use `npm run audit:usda-hpgrs-longterm` para conferir integridade e cobertura, `npm run audit:engine-adg-range` para uma checagem descritiva de faixa de ADG e `npm run audit:engine-dmi-mendeley` para a checagem fixa do DMI em Nelore confinado. Esses checks não validam nem calibram o motor completo.

The versioned scenario contract v2 extends the existing comparison manifest while preserving v1 replay. See [the contract and version policy](docs/scenario-contract-v2.md), [the JSON Schema](schemas/scenario-contract.schema.json), and run `npm run example:scenario-contract` for a deterministic round-trip and replay example.
## Native scenario CLI

The headless Rust runner accepts versioned baseline and housing-comparison
requests. See [the CLI contract and exit codes](docs/native-scenario-cli.md).
