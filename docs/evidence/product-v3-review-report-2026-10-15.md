# Product V3 product and scientific-readiness audit — 2026-10-15

## Scope and evidence

Audited `/scenario-lab.html` from a running local server with Playwright Chromium. Viewports: desktop 1440×1000 and mobile 390×844. `npm run audit:product-v3` captured every state listed below. The script recorded zero browser console/page errors and no document-width overflow in the captured states. Screenshots were opened and visually inspected after capture.

The task was to enter a supported experiment, see unsupported-input recovery, review and run a demonstrative FarmEngine comparison, inspect the separate BR-CORTE review/calculation, and check mobile layout. E2E additionally exercises archive tampering/replay, keyboard movement and `prefers-reduced-motion`.

## Step-by-step health

1. **Initial screen and values — good with one clarity risk.** The page labels the FarmEngine as illustrative and says there is no AI service. The forms are prefilled (including 200 animals, 30 days, seed and supplement levels); the input labels and explicit review action are visible, but a new user could mistake the sample values for their own experiment. The review still requires confirmation. The results caption and warning are prominent.
2. **Unsupported request — good.** A gain-prediction request is rejected with a `role=status` message and a path to add/restate supported inputs. It does not run a Worker or silently map the request to FarmEngine outputs.
3. **FarmEngine review — good.** It names 3 arms, 8 generated engine animals, 3 days, seed and one changed factor, displays the projected-resource estimate, and discloses that FarmEngine rules are not independently validated. The initial run is explicit.
4. **FarmEngine results — good, with scientific restriction still required.** The graph, timeline, ID grid and table show actual Worker output. Text calls values illustrative and the sweep is explicitly neither a confidence interval nor a causal estimate. These results remain unsuitable for cattle-management decisions.
5. **BR-CORTE review — good.** BW, supplied ADG, representative animal count, days, supplement DM units, optional cost basis and fixed-input assumptions are shown before calculation.
6. **BR-CORTE results — defect found and fixed.** The output includes Eq. 2.6, its source-reported independent-validation statistics, `not Riose-calibrated`, units, representative-input assumption and exclusions. The registry provenance incorrectly called the published equation `demonstrative`, conflating source-evidence type with the separate “no Riose calibration” status. The adapter now records `published-equation-with-external-validation; no Riose-specific calibration`; equation, formula, numerical outputs, domain and scientific gate are unchanged. See the after-fix screenshot and test evidence.
7. **Mobile initial state — defect found and fixed.** At 390px, the top navigation was splitting each label across lines. It now wraps the navigation onto a second row and preserves each label on one line. Playwright confirms link heights ≤28px and document width 390px.
8. **Mobile results — acceptable.** The configuration, review, chart, grid, table and separate science module reflow in one column with no horizontal page overflow. The small graph/table and long full-page flow require scrolling; the 1,200 rendered-cell cap and smaller mobile grid cap remain disclosed in code/benchmark records.

## Accessibility checks and limits

- Prompt, inputs and selectors have accessible labels; initial/error/review/run states use live status semantics.
- Keyboard Arrow navigation selects population cells; the E2E checks selected-cell state and inspector update.
- Reduced-motion E2E emulation confirms population-cell transition duration becomes `0s`.
- Visible focus rules are present for primary form and population controls.
- Mobile layout has no horizontal overflow in the tested 390px viewport.
- This is not a WCAG conformance audit. Screen-reader announcement quality, zoom at 200–400%, contrast measurements, browser/OS assistive technology, and keyboard traversal of the entire page were not fully evaluated.

## Population performance evidence

The benchmark was run from clean source revision `7391758131771a08ee497c9baabceefeea1fa89d` using `npm run bench:scenario-lab`: 1 warmup and 3 repetitions each at 100, 1,000 and 10,000 animals; 3 arms; 7 days; seed `20261015`. Environment: Linux 6.6.87.2-WSL2, AMD Ryzen 7 7700X, headless Chromium 143.0.7499.4, viewport 1440×1000.

| Animals | Confirmed run to visible grid (median) | Result JSON projection | Worker result to painted grid (median) | Rendered cells | Page renderer heap (observations) |
|---:|---:|---:|---:|---:|---:|
| 100 | 227 ms | 322,714 bytes | 31.8 ms | 100 | 4.73–4.75 MB |
| 1,000 | 1.382 s | 3,147,288 bytes | 259.7 ms | 1,000 | 21.15 MB, 21.16 MB, 69.32 MB |
| 10,000 | 16.524 s | 31,580,825 bytes | 2.684 s | 1,200 cap | 385.48 MB, 385.48 MB, 181.42 MB |

The complete observations and measurement boundaries are in [`product-v3-scenario-lab-p3-011-benchmark-2026-10.json`](product-v3-scenario-lab-p3-011-benchmark-2026-10.json). Heap variation is material and likely sensitive to collection/timing; these measurements do not establish a stable memory budget. CDP samples only the page renderer, not Worker heaps, browser-process RSS or GPU memory. JSON length is a proxy, not actual structured-clone bytes. The 10,000-animal result completed and respected the 1,200-cell render cap in all three runs. These are one-host measurements of illustrative FarmEngine output, not biological evidence or a cross-device service-level guarantee.

## Defects fixed

| Finding | Change | Verification |
|---|---|---|
| BR-CORTE provenance called a published equation “demonstrative,” conflating model evidence with Riose calibration status. | Scientific registry evidence status now states published equation/external validation and explicitly says no Riose-specific calibration. UI calls it “evidence classification.” No formula or calculation behavior changed. | `tests/scientific-model-contract.test.js`; `tests/br-corte-scenario.test.js`; `npm run test:e2e:scenario-lab`; fixture reproduced from the same manifest. |
| Mobile main-navigation labels wrapped across multiple lines. | Scenario-lab mobile header now places navigation on its own row and prevents label wrapping. | New browser assertion in `scripts/e2e/scenario-lab.mjs`; capture workflow checks link height and 390px width. |

## Readiness decision

**Ready for controlled product demonstration:** deterministic, explicitly reviewed 3-arm FarmEngine output; versioned result export and replay; and the conditional BR-CORTE total-DMI calculator within its stated domain and input assumptions.

**Not ready for management decisions or commercial claims:** FarmEngine prediction; BR-CORTE as a Riose-calibrated or full-farm predictor; autonomous ADG/gain, forage intake, pasture stock, profit, heat/water response, behavioral response or calibrated uncertainty; the Perea behavioral generator; paid decision use. No prospective user interviews or willingness-to-pay study were conducted. Software test and parity passes are not scientific validation.

**Independent review:** not performed. This audit does not approve the science or pass P3-008. Use [`../scientific-review/product-v3-independent-review-package-2026-10.md`](../scientific-review/product-v3-independent-review-package-2026-10.md) as the evaluator handoff.

## Capture inventory

Screenshots are saved under [`product-v3-review-2026-10-15/`](product-v3-review-2026-10-15/): initial desktop; rejected unsupported request; FarmEngine review and outputs; BR-CORTE review and outputs after the provenance fix; initial mobile and mobile outputs. Run `npm run audit:product-v3` to repeat the capture and state assertions. The T3 preview automation host was unavailable in this environment; the screenshots came from the repository's installed Playwright/Chromium toolchain against the actual local server.
