# Riose Product V3 — Independent scientific review package

**Package version:** 1.0
**Prepared:** 2026-10-15
**Review status:** `NOT_PERFORMED` — no independent external evaluator has reviewed or approved this package.
**Product decision status:** demonstration and bounded calculation only; no commercial decision-use approval.

## 1. Purpose and reproduction boundary

This package is for an independent animal-nutrition/modeling reviewer and a product evaluator. It separates deterministic software behavior from scientific validity. Passing the listed tests proves only the named software contracts and numerical reproductions; it does not validate Riose's farm predictions or establish that customers should use them to make management decisions.

The evaluated product surface is Product V3 at `/scenario-lab.html`. Product V2 and `experiments.html` remain legacy-compatible surfaces. The behavioral generator is not connected to Product V3. The Perea semi-Markov candidate remains `NO-GO` and research-only.

### Reproduce the checked-in package

Use the repository revision under review. The package was prepared from branch `codex/behavioral-agents-sdd`, based on P3-010 commit `8da5163` plus the P3-011 changes recorded in `specs/riose-product-v3/handoff.md`. Do not edit the fixtures, thresholds, source artifacts, or candidates before first replay.

```bash
npm ci
npm run test:br-corte-scenarios
npm run test:perea-no-go-diagnostics
npm run test:e2e:product
npm run test:e2e:scenario-lab
npm test
npm run test:parity
```

For visual evidence, start the local server in one terminal and run the capture workflow in another:

```bash
npm run start
npm run audit:product-v3
```

`audit:product-v3` uses Playwright and the running local application. It writes the eight screenshots under [`../evidence/product-v3-review-2026-10-15/`](../evidence/product-v3-review-2026-10-15/) and fails on unexpected output state, browser console errors, page overflow, or wrapped mobile navigation. It is a repeatable product-flow capture, not a substitute for an expert scientific review or assistive-technology audit.

### Reproducible cases, seeds, outputs, and tolerances

| Case | Frozen input/configuration | Expected result / tolerance | Reproduction |
|---|---|---|---|
| BR-CORTE Eq. 2.6 published worked vector | BW 400 kg; supplied ADG 0.5 kg/day; supplement 1.6 kg DM/day | Table 2.14 value 7.58 kg DM/day; unrounded implementation vs fixture absolute error `<1e-12 kg/day` | `npm run test:br-corte-scenarios`; `tests/fixtures/scientific-numeric-reference-v1.json` |
| BR-CORTE scenario arithmetic | Same equation inputs; 200 represented animals; 30 days; levels 1.6, 2.0, 2.5 kg DM/head/day; user price BRL 4/kg DM | Raw per-head results, arithmetic herd totals, supplement totals, and price multiplication are saved in the reference JSON. Baseline herd total error `<1e-8 kg DM`; costs equal direct multiplication. | [`br-corte-product-v3-reference-scenario-v1.json`](../evidence/br-corte-product-v3-reference-scenario-v1.json); `npm run test:br-corte-scenarios` |
| FarmEngine three-arm browser run | Seed `20261015`; 8 engine animals; 3 days; hot rule set; 0.5/1.0/1.5 kg DM/head/day; fixed shared snapshot | 3 actual Worker arms, 8 stable IDs, day 0–3 output; repeated archive replay must canonically reproduce the saved output. Outputs are illustrative, not biological targets. | `npm run test:e2e:scenario-lab`; `npm run audit:product-v3` |
| Existing parity golden: baseline pasture | Seed 417; 3 animals; 24 hours; pasture, normal weather, supplement 0 | Cross-engine parity under frozen schema and tolerances. Floating fields: absolute `1e-10`, relative `1e-12`; exact fields/array ordering remain exact. | [`baseline-pasture.json`](../../tests/scenarios/baseline-pasture.json), [`parity-tolerances-v1.json`](../../tests/scenario-goldens/parity-tolerances-v1.json); `npm run test:parity` |
| Perea confirmatory semi-Markov evaluation | Frozen 20 development animals / 4 confirmatory animals; source-specific partition, schemas, seeds and code/data hashes are in the result artifact | Reproduces a negative gate result. Do not use the opened confirmatory animals to tune or select a replacement. | [`perea-confirmatory-v1.md`](../evidence/perea-confirmatory-v1.md), [`perea-confirmatory-v1.json`](../evidence/perea-confirmatory-v1.json), `npm run test:perea-no-go-diagnostics` |
| Population browser benchmark | Seed 20261015; 3 supplement arms; 7 days; 100, 1,000, 10,000 animals; 1 warmup, 3 repetitions | Machine/browser-specific. JSON bytes are a payload proxy; memory is page-renderer JS heap only, excluding Worker heaps, browser process and GPU. Not a scientific metric. | Captured at source revision `7391758`: [`product-v3-scenario-lab-p3-011-benchmark-2026-10.json`](../evidence/product-v3-scenario-lab-p3-011-benchmark-2026-10.json); `npm run bench:scenario-lab` for a new run |

The checked-in parity tolerance file defines the exact and floating comparison contract. The Perea diagnostic JSON records the candidate, evaluator, source, protocol and result hashes, while the confirmatory report contains the animal-level metrics and frozen gate outcomes. Compare the complete raw JSON, not only this summary.

### Current browser benchmark result

The P3-011 run used headless Chromium 143.0.7499.4 on Linux 6.6.87.2-WSL2, AMD Ryzen 7 7700X, 16 reported logical CPUs, and a 1440×1000 viewport. It ran one warmup and three measured repetitions at each population size. Median reviewed-run-to-grid times were 227 ms (100), 1.382 s (1,000), and 16.524 s (10,000). Median Worker-result-to-painted-grid times were 31.8 ms, 259.7 ms, and 2.684 s. The corresponding result JSON projections were 322,714 bytes, 3,147,288 bytes, and 31,580,825 bytes. The grid rendered 100, 1,000, and the capped 1,200 cells, respectively. At 10,000 animals, page-renderer JS heap observations were 385,480,484; 385,476,080; and 181,419,344 bytes, showing material variability (likely collection/timing sensitivity); this is not a stable memory budget and excludes Worker heap, browser-process RSS, and GPU memory. The run demonstrates this setup can complete the supported 10,000-animal illustrative case, not that it will meet a latency or memory target on other devices.

## 2. Model and executor inventory

### Product V3 illustrative scenario set

- **Contract:** `riose-scenario-set/v1`; result envelope is validated as `validated: false`.
- **Executor:** `javascript-scenario-set` using the deterministic JavaScript FarmEngine/worker path. The recent scenario-set UI does not execute through Rust/WASM; the existing parity harness validates established paths separately.
- **Inputs:** one immutable FarmEngine snapshot, seed, day horizon, count up to 10,000, one shared illustrative weather rule, baseline supplement and 2–9 alternatives (each bounded to 0–4 kg DM/head/day). Supplementation is the only intended factor change across arms.
- **Outputs:** actual engine-generated aggregate traces and individual engine states for the run, checkpoint rows, arm identity and execution metadata. The population is a seeded engine population, not observational cattle records.
- **Units:** body weight kg; supplement kg DM/head/day; time in days; scenario/arm and animal identity as identifiers. The engine's specific consumption outputs are governed by its existing conventions and must remain labeled as illustrative.
- **Evidence:** code and deterministic regression tests establish repeatability and JS/Rust parity on the named legacy comparison paths. They do not establish biological validity of FarmEngine's weight, intake, activity, heat, pasture, water, or cost rules.
- **Use boundary:** demonstrate “what this rule set outputs under these inputs.” Do not call the chart a validated forecast, causal effect, confidence interval, probability, or management recommendation.

### BR-CORTE 2023 Eq. 2.6 conditional DMI calculator

- **Model ID/version:** `br-corte-2023-eq-2.6@2023`; source-level interface v1; Product V3 manifest/result v1.
- **Equation:** total DMI = `−0.4684 + 0.7732 × supplement + 0.0742 × BW^0.75 + 0.7953 × ADG − 0.9047 × ADG²`.
- **Inputs/units:** representative body weight (kg), user-supplied average daily gain (kg/day), and supplement dry matter intake (kg DM/day per head). The implementation does not predict ADG.
- **Declared applicability:** growing/recria Zebu on tropical pasture receiving supplementation, with moderate concentrate and ADG, using the chapter's described conditions. The published independent validation set has 174 experimental units with BW 133–474 kg, ADG −0.18–1.34 kg/day, and supplement 0–5.32 kg/day. The chapter notes that much of the equation-development data came from dry-season periods. Marginal ranges are not a guarantee that every combination is equally represented.
- **Published evidence:** Eq. 2.6 development fit R² = 0.638 on 1,069 experimental units; separate source-reported validation for pasture Zebu has R² = 0.670, mean bias +0.761 kg/day, concordance correlation coefficient 0.741, and mean-square prediction error 2.13. These are BR-CORTE chapter statistics, not Riose-specific calibration/validation results.
- **Outputs:** conditional total DMI; transparent representative-input population × day arithmetic; optional supplement-DM amount × user-entered price/currency. The subtraction of supplement from total DMI is not separately measured/validated forage DMI. Cost is supplement expenditure arithmetic, not total ration cost or profit.
- **Evidence status:** published equation with source-reported external validation; no Riose-specific calibration. A numeric result remains a conditional estimate from a published equation, not a validated farm-level decision.
- **Explicit exclusions:** ADG/gain prediction; weight trajectory; individual DMI; distribution/heterogeneity; measured forage intake; pasture stock/depletion; heat, water or behavioral response; profit; causal claim about the effect of supplementation; prediction intervals or calibrated probabilities.
- **Source:** [BR-CORTE 2023, Chapter 2, Eq. 2.6, Tables 2.12–2.14](https://brcorte.com.br/assets/book2023/br/02.pdf). See also the repository's [domain audit](../evidence/br-corte-pasture-dmi-domain-audit-2026-10.md) and [saved reference run](../evidence/br-corte-product-v3-reference-scenario-v1.json).

### Behavioral generator — explicitly excluded

- **Candidate:** Perea semi-Markov behavior candidate; `NO-GO` for the candidate/source under the frozen confirmatory protocol.
- **Runtime status:** disabled, research-only, disconnected from the default FarmEngine and Product V3. It must not be used to populate behavior states or explain scenario outcomes.
- **Evidence boundary:** four-animal same-source/two-ranch confirmatory holdout; no complete 24-hour windows; no independent-site validation; no intervention/physiology/DMI/ADG/weight outcomes. This does not show that behavior generation is universally invalid. It shows the candidate failed its preregistered gate on this source.
- **Artifacts:** [`confirmatory report`](../evidence/perea-confirmatory-v1.md), [`machine-readable confirmatory results`](../evidence/perea-confirmatory-v1.json), [`post-NO-GO diagnostics`](../evidence/perea-no-go-diagnostic-v1.json), and [`frozen behavioral protocol`](../../specs/riose-behavioral-agents/09-confirmatory-protocol-v1.md).

## 3. Scientific claim matrix

| Capability | Product may demonstrate | Product may calculate | Product may not claim/predict |
|---|---|---|---|
| FarmEngine scenario comparison | Deterministic outputs for a fixed seed, snapshot, declared one-factor arm set, selected illustrative rule set, and engine version. Repeatability and identity binding are testable. | Exact software outputs of FarmEngine from the specified inputs. | Real cattle growth, intake, heat stress, pasture response, activity, cost/profit, causal supplement effect, uncertainty or probability. |
| BR-CORTE calculator | How the registered Eq. 2.6 changes for explicit in-domain inputs, plus transparent totals and supplied-price arithmetic. | Conditional total DMI for the stated growing-Zebu tropical-pasture domain, supplied ADG and inputs within published ranges. | ADG or weight-gain forecast; measured forage intake; individual animal results; mature-cow applicability; pasture balance; full-farm response; profit or uncertainty intervals. |
| Behavioral generator | Historical failure diagnosis for this candidate/source and protocol. | Reproduction of the frozen negative diagnostics. | Executable cattle behavior, broad behavioral population claims, physiology, nutrition, or supplementation effects. |
| Scientific agent / paid AI | Not available in this delivery; deterministic prompt parsing may create a review draft only. | No provider-driven scientific result generation. | Invented numbers, independent model execution, direct per-tick animal control, or circumventing provider spend/execution gates. |

## 4. Product-review findings and decision boundaries

Current visual and functional audit notes are in [`product-v3-review-report-2026-10-15.md`](../evidence/product-v3-review-report-2026-10-15.md), supported by the captures in [`product-v3-review-2026-10-15/`](../evidence/product-v3-review-2026-10-15/).

Capabilities ready for an external demonstration:

- User drafts a supported prompt, reviews structured fields, and explicitly confirms before the FarmEngine Worker runs.
- Three or more named supplement arms share a seed/snapshot; exported results bind to reviewed/executed manifest hashes and deterministic replay is checked.
- BR-CORTE inputs are separately reviewed and produce a bounded DMI calculation with model source/version/provenance and explicit excluded claims.
- FarmEngine limits and BR-CORTE scope appear in the interface. Product V2 and existing parity regressions are retained.

Not authorized as decision-use evidence:

- Any FarmEngine biological or economic output.
- Claims that the BR-CORTE calculator forecasts animal gain, forage intake, individual variation, heat/water response, pasture availability, profit, or Riose-specific accuracy.
- Any behavioral-generator output or model promotion.
- Any claim that software regressions or cross-executor parity validate biological predictions.
- Any paid customer decision-use claim under the P3-008 gate.

## 5. Questions for the independent evaluator

1. Does the application-domain statement for Eq. 2.6 match the chapter's recommendation and the reported validation set, including the dry-season qualification?
2. Are the per-head and herd totals, units, supplied-ADG semantics, optional cost arithmetic, and presentation adequate for the intended bounded demonstration?
3. Which input combinations or user mental models could cause the DMI equation output to be treated as forage intake, gain prediction, or an intervention response?
4. Is the deterministic FarmEngine scenario lab clearly separated from quantitative scientific output at every entry, review, execution, result, export and replay step?
5. What additional external observations or evaluation design would be required before a named management decision is supported?
6. Does the behavioral NO-GO diagnosis accurately follow its frozen protocol without implying that all behavioral modeling is invalid?

## 6. Approval / rejection protocol

The reviewer should receive this file, the referenced repository revision, all linked raw JSON/fixtures and the screenshots. The reviewer should independently run the reproduction commands before judging the software reproduction claims.

Record a decision only in a new signed review record that identifies: evaluator name and relevant expertise; independence/conflict statement; date and reviewed commit; exact scope; commands and environment; reproduced deviations; scientific objections; any allowed claims and prohibited claims; and explicit `APPROVE`, `CONDITIONAL`, or `REJECT` disposition. A software reproduction mismatch, domain overclaim, unclear material limitation or unsupported intended use warrants rejection or a stated condition.

**No reviewer has participated in preparing this package. No independent review is claimed or approved.** The P3-008 gate remains blocked until an independent signed review and its other acceptance evidence exist. P3-007 remains blocked until the shared persistent provider-spend gate exists. The behavioral NO-GO remains unchanged.
