# Progress record

## 2026-10-15 — first functional vertical slice

- Audit and implementation branch are based on `fcd4254`; see [checkout audit](../../docs/architecture/product-conversational-simulation-audit-2026-10-15.md).
- Implemented deterministic intent parsing and strict versioned validation; optional server OpenAI/Groq/Hugging Face structured-output adapter; no-key deterministic workflow.
- Product now has initial prompt, prompt suggestions, review card, explicit run, Worker progress, paired population grid, selected-animal inspector, compact transition history, timeline, paired aggregate analysis, limitations, local history replay and JSON export. Old form UI is preserved on `experiments.html` through its own module.
- Displayed deltas use intervention minus baseline from matching IDs/checkpoints. Consumption/cost remain herd aggregates. Breed is metadata only, and the engine is labeled demonstrative/unvalidated.
- Compact activity history is retained only on final checkpoint and expanded for selected animal. Grid DOM initially caps at 1,200.
- Performance sample: 30-day JS run + compact serialization, seed `20261015`: 100 animals 452.7 ms / 320,472 B; 1,000 3,867.6 ms / 2,968,811 B; 10,000 58,289.9 ms / 29,418,246 B. These are single local Node measurements, not browser memory/latency evidence.
- Tests: final `npm test` **445/445 pass**; `npm run test:parity` **pass** (baseline pasture 24 checkpoints; housing comparison 1,440 hourly checkpoints/31 daily rows); `npm run test:e2e:product` **pass** (200-animal review/run, inspector, export, amendment/re-run, local replay, mobile layout). Focused intent/API tests are included in the full suite.
- Browser: reusable local Playwright Chromium flow inspected initial view, review/no-auto-run, 200-animal run, quantified legend, selection, timeline, export, revision/no-auto-run, replay, and 390px mobile; zero console errors and no horizontal overflow. Screenshots are in `../../docs/evidence/product-v2-*.png`. T3 preview status explicitly reported no preview automation host, so local headless Chromium was used.
- The English phrase “200 Nelore cattle” initially fell back to 24; it is fixed and covered by parser and E2E checks. Review also now states that supplement is interpreted using the engine kg DM/head/day unit. Parity-generated tracked artifacts were restored after the final run. Native Rust population results, browser 10k profiling, sensitivity panel, and a run-cancel button remain follow-up limitations.

- Pull request opened without merge: [#190](https://github.com/santleme/riose-agro/pull/190), branch `t3code/conversational-population-simulation`. Three responsibility-scoped commits are on the branch.
