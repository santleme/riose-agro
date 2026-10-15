# Product V4 progress

## 2026-10-15 — Live provider readiness recheck

- Rechecked environment safely by reporting only presence: `GROQ_API_KEY`, `HF_TOKEN`, `LLM_PROVIDER`, `GROQ_MODEL`, `HF_MODEL`, and `LLM_MODEL` were all absent from the process environment. No secret values were read or emitted. No cloud-runtime secret configuration control is exposed in this session.
- The user authorized a controlled live integration battery within the providers' actual available quotas/rate limits, without a per-call approval prompt and without unlimited retries. No credential was available, so no live provider call, model discovery, latency, or token usage is claimed. Chat-pasted credential values were not used.
- `npm test`: PASS, 510/510 (45.1 s).
- `npm run test:e2e:scenario-lab-ai`: PASS, fixture-backed V4 review → explicit run → archive export/import → explicit replay. The script states no provider was contacted. First attempt correctly failed because the local server was stopped; rerun passed after `npm start`.
- `npm run test:e2e:scenario-lab`: PASS; 3 scenarios, cancellation, sensitivity, 390 px mobile without horizontal overflow, zero console errors.
- `npm run test:e2e:product`: PASS; Product flow including prompt/review, explicit paired run, population inspection/export, revision/re-run, local replay and mobile layout.
- `npm run test:parity`: PASS; pasture seed 417 (24 checkpoints), housing seed 2026 (1,440 hourly checkpoints, 31 daily rows).
- P4-007 remains blocked only on secure provider configuration for this run. P3-007 remains blocked for production/shared usage; Perea behavioral NO-GO remains unchanged. Local fixture coverage is not reported as live AI validation.

## 2026-10-15 — Context recovery and baseline

- Branch: `codex/behavioral-agents-sdd`; starting HEAD `93cfbd7`; working tree clean. Prior local commits preserved, no reset/push/merge.
- Read Product V2/V3 SDD, P3-011 review package, Product V3 source, scientific model contract, BR-CORTE scenario wrapper and behavioral-agent task/handoff/decision records. No V4 folder existed. No repository `AGENTS.md` or `GLOSSARY.md` found.
- Reusable: V3 three-arm deterministic scenario set, shared seed/snapshot, Worker cancellation, archive/replay; separate P3-004 BR-CORTE multi-level table and optional user-entered price arithmetic; deterministic prompt parsing; registered model/provenance; P3-011 browser capture/benchmark.
- Gap: `analyzePastureDmiSensitivity` only provides a fixed OAT diagnostic in the scientific module; it is not a user-selectable reviewed interval/step and is not exposed in Product V3. Do not conflate FarmEngine sweep with scientific sensitivity.
- BR-CORTE contract: BW 133–474 kg, supplied ADG −0.18–1.34 kg/day, supplement 0–5.32 kg DM/head/day. Equation estimates conditional total DMI and does not predict gain. FarmEngine stays demonstrative; Perea stays NO-GO; P3-007/008 gates unchanged.
- Baseline `npm test`: 497/497 pass, 0 fail (41.5 s). P3-011 benchmark baseline and exact machine-specific limits are in the V3 handoff.
- P4-001 complete: V4 specs and audit baseline are recorded; P3 gates and scientific boundaries are preserved.
- Next: implement P4-002 bounded BR-CORTE sensitivity sweep at a strict versioned public seam.


## P4-002 — BR-CORTE deterministic sensitivity slice

- Added `riose-br-corte-dmi-sensitivity/v1` request and JSON Schema; only eligible input is supplement at 0–5.32 kg DM/head/day, while body weight and user-supplied ADG remain fixed. Interval must be step-divisible and produce 2–101 points.
- Each row calls registered `br-corte-2023-eq-2.6@2023`, returns actual total DMI, arithmetic represented-herd totals and optional user-priced supplement cost, with source/model implementation provenance. Exact derivative 0.7732 is labeled equation sensitivity, not intervention causality. Prediction interval remains null; validated remains false. No formula or FarmEngine behavior changed.
- Added a distinct sensitivity review and explicit Calculate action, chart, table, units and limitation text. Editing the sweep revokes reviewed and computed state. Mobile scientific controls reflow to one column, 42 px action target, 12 px labels, and 390 px has no horizontal overflow. New UI adds no animation; existing reduced-motion behavior remains unchanged.
- Tests: sensitivity contract/schema 5/5; existing BR-CORTE scenario/cost 3/3; Product V3 E2E pass with seven calculated points, range edit invalidation/no automatic execution, desktop capture, mobile result, 390 px no overflow and no browser console errors; Product V2 E2E pass. Captures: `docs/evidence/product-v4-br-corte-sensitivity-desktop.png`, `docs/evidence/product-v4-br-corte-sensitivity-mobile.png`.
- The initial mobile E2E caught 10 px labels on the new sweep (style selector missed its class). Scoped mobile typography was corrected and the rerun passed.
- P4-003 is next READY: replace implicit numeric/scientific form values with empty inputs and an explicitly loaded example. Full regression/parity run follows P4-003.


## P4-003 — Explicit example and empty-input state

- Cleared population, duration, intervention and BR-CORTE numeric form values on initial load; blank inputs and blank weather rule now block review. The visible reproducibility seed remains and is labeled as configuration, not animal data. Examples are explicit; loading fills editable inputs only and never runs a calculation.
- Added a BR-CORTE example button using representative values and no price. Inline message says inputs are illustrative and not observations. Prompt example button remains draft-only.
- E2E asserts initial inputs are empty/invalid, no review/results/Worker post is created, examples load explicitly, and calculation still needs explicit review/confirmation. Product V3 flow passes. Full suite `npm test` 502/502; JS/Rust parity passes 24 pasture and 1,440 hourly housing checkpoints; Product V2 E2E passes.
- Visual captures: `docs/evidence/product-v4-empty-state.png` and `docs/evidence/product-v4-empty-and-example-state.png`; reviewed at 1440×1000. Sensitivity mobile result capture continues to show 390 px width and no overflow.
- P4-004 discovery protocol, neutral demonstration script, and blank interview record are complete in `docs/product-research/`. Materials state they are prepared, not executed; no users were contacted and no findings are claimed. Readout thresholds are precommitted and explicitly do not confer scientific or commercial approval.

## P4-004 — User discovery preparation

- Prepared an exploratory protocol for a recurring pasture supplementation and cost-comparison decision, a seven-minute neutral product demonstration, and an empty anonymized feedback instrument.
- The materials distinguish user-workflow evidence from scientific validation and commercial readiness. They prohibit invented participant data/prices, require consent, and do not authorize outreach. No interviews or external contact occurred.
- Reviewed all three documents for consistency and blank response fields; `git diff --check` passes. No software tests apply to this document-only task.
- P4-005 was selected next because sensitivity output had no dedicated scientific archive/replay contract. The existing scenario-set archive remains unchanged.

## P4-005 — BR-CORTE sensitivity archive and explicit replay

- Added `riose-br-corte-dmi-sensitivity-archive/v1` and a strict JSON Schema. The archive records the complete reviewed sensitivity manifest, computed rows, model ID/version, registered implementation hash, canonical SHA-256 digests, executor, units, assumptions, and `seed: null` (the equation has no stochastic seed). `validated` remains false.
- Archive creation and opening recompute Eq. 2.6 through the registered model and compare canonical result content. A changed input, output, implementation identity, digest, or provenance is rejected. This is integrity/reproducibility evidence, not a cryptographic signature or model validation.
- Product export emits this archive. Opening one loads editable/reviewable inputs and the expected result but does not calculate. The explicit Calculate action re-executes and compares canonical outputs. Invalid import leaves the prior valid visible result intact. Existing `riose-scenario-lab-archive` v1 and BR-CORTE scenario export formats remain unchanged.
- Tests: sensitivity contract/archive/schema 7/7; BR-CORTE scenario 3/3; scenario-lab archive integrity 4/4; Product V3 E2E PASS (download, tampered-result rejection, no-run open, explicit exact replay, edit invalidation, 390 px responsive check, no console errors); Product V2 E2E PASS; full `npm test` 504/504 (baseline was 497; seven sensitivity checks total); `npm run test:parity` PASS for pasture seed 417 (24 checkpoints) and housing seed 2026 (1,440 hourly checkpoints and 31 daily rows).
- Browser visual review: T3 collaborative preview reported no automation host for this headless environment, so the existing local Chromium Playwright E2E was used. Desktop and 390 px mobile captures are in `docs/evidence/product-v4-br-corte-sensitivity-desktop.png` and `...-mobile.png`; mobile page has no horizontal overflow. Export action is present below the actual calculated table/provenance. No new motion was added; reduced-motion styling remains in force.
- No scientific equation, domain, threshold, FarmEngine output, evidence status, behavioral gate, or paid-provider configuration changed. `P3-007` remains blocked and Perea semi-Markov remains NO-GO.

## Queue review

- No additional code task is READY without duplicating V3 comparison/replay, the existing cost calculator, or P4 sensitivity/archives. Remote AI remains behind P3-007; scientific/commercial approval remains behind P3-008; collecting user feedback requires real recruited participants and consent. These are gates/dependencies, not work that can be represented as completed locally.

## 2026-10-15 — Optional V4 AI interpretation slice

- Added a server-only `/api/interpret-scenario-lab` adapter for Groq and Hugging Face chat-completion APIs using a strict JSON Schema for the existing `riose-scenario-lab-intent/v1`; no tools, scientific calculations, or execution fields are offered. Request/response bounds and a five-second timeout are enforced; server responses are validated with the existing V4 intent contract and reconciled against deterministic unsupported/missing-input checks.
- Product V4 now requests optional remote interpretation. Missing key, provider error, invalid response, or rate limit falls back to the deterministic parser. The interface identifies the interpreter used; draft preparation still only creates a review. The Run button remains the only engine execution path.
- New archives use `riose-scenario-lab-archive/v2`, binding interpreter source/provider/model alongside existing manifest, result, seed, executor, units, assumptions and digests. Version 1 archives remain readable; no keys enter browser state or exports. The per-process/IP request limiter is only abuse control, not a shared spend ceiling.
- Security tests cover strict schemas, prompt injection in text, local unsupported-outcome reconciliation, missing credential, malformed/out-of-range provider output, and endpoint bounds. Archive tests cover v2 AI metadata, manual edits preserving the initial proposal, and v1 compatibility. Scenario Lab fallback desktop/mobile E2E, provider-fixture review/run/export/replay E2E, Product V2 E2E and full regression passed. The current full regression after the manual-revision test is recorded in the handoff.
- No API key is available as a secure environment variable. A credential was pasted in chat more than once and is treated as exposed; it must be revoked and replaced through secure environment configuration. No provider/model listing or inference request was made. The user authorized one non-production interpretation request up to USD 0.10; that authorization remains unused. P3-007 stays blocked for production.
- Final evidence after the manual-revision provenance change: `npm test` 510/510 pass; `npm run test:parity` pass (pasture seed 417, 24 checkpoints; housing seed 2026, 1,440 hourly checkpoints and 31 daily rows); `npm run test:e2e:product` pass; `npm run test:e2e:scenario-lab` pass (desktop + 390 px mobile, no horizontal overflow/console errors); `npm run test:e2e:scenario-lab-ai` pass using an explicit fixture route (not a live provider). Browser captures reviewed at `docs/evidence/product-v3-scenario-lab-initial.png` and `docs/evidence/product-v3-scenario-lab-results.png`; screenshots are local Chromium evidence. T3 preview has no automation host in this headless environment.
- Official API references used for implementation: [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq model catalog](https://console.groq.com/docs/models), [Hugging Face Inference Providers structured output](https://huggingface.co/docs/inference-providers/en/guides/structured-output). Public Groq docs list `openai/gpt-oss-20b` as supporting structured outputs; account access and rate/cost availability remain unverified. HF model/provider availability is account-specific and unverified.
