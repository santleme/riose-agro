# Product V3 session handoff

Date: 2026-10-15
Last verified commit: pending final P3-011 evidence/documentation commit; benchmark was executed against clean source commit `7391758131771a08ee497c9baabceefeea1fa89d`.
Current branch: `codex/behavioral-agents-sdd`; all commits are local and unpushed. Do not rewrite history, force-push, or work around network policy.

Completed tasks: P3-001 through P3-006, P3-009, P3-010, and P3-011. P3-007 and P3-008 remain BLOCKED; behavioral model integration remains NO-GO.
Task in progress: none. No next task is READY without bypassing the blocked provider/scientific gates; hand off for external product/user evaluation and independent scientific review rather than inventing more tasks.
Files changed in P3-011: BR-CORTE adapter provenance classification, scientific-model/report tests and saved reference output; scenario-lab mobile navigation and E2E check; repeatable review capture script; reviewer package, audit report, desktop/mobile screenshots, browser benchmark artifact; Product V3 SDD records.

Tests and evidence:
- Focused BR-CORTE/scientific registry/report tests: 30/30.
- Perea post-NO-GO diagnostics: 3/3; frozen NO-GO preserved.
- Full `npm test`: 497/497.
- `npm run test:parity`: pass, 24 pasture checkpoints and 1,440 hourly housing checkpoints / 31 daily rows.
- Product V2 E2E pass; Product V3 E2E pass, including explicit confirmation, review invalidation/no-auto-run, archive tampering, replay, keyboard navigation, reduced motion and mobile layout.
- `npm run audit:product-v3`: pass at desktop 1440×1000 and mobile 390×844; 8 screenshots; zero console/page errors and no horizontal overflow.
- `npm run bench:scenario-lab`: one warmup + three measured runs per size; 100, 1,000, 10,000 animals; three arms, seven days, seed `20261015`; clean source `7391758`. Confirmed-run-to-visible-grid medians: 227 ms, 1.382 s, 16.524 s. Result JSON projection: 322,714 B, 3,147,288 B, 31,580,825 B. Worker-result-to-grid medians: 31.8 ms, 259.7 ms, 2,683.8 ms. Grid: 100, 1,000 and capped 1,200 cells. Raw artifact: `docs/evidence/product-v3-scenario-lab-p3-011-benchmark-2026-10.json`.
- `git diff --check`: pass before final docs commit (rerun before commit).

Quality boundaries: benchmark is one Linux/Chromium host only. JSON is a structured-clone size proxy. Page-renderer heap varied materially at 10k (385,480,484; 385,476,080; 181,419,344 bytes) and excludes Worker heaps, browser-process RSS and GPU. No cross-device latency or memory guarantee follows. The benchmark measures illustrative FarmEngine output, not biology. Product screenshots and audit: `docs/evidence/product-v3-review-2026-10-15/`; full audit: `docs/evidence/product-v3-review-report-2026-10-15.md`; reviewer packet: `docs/scientific-review/product-v3-independent-review-package-2026-10.md`.

Defects corrected: BR-CORTE provenance no longer misclassifies a published equation with source-reported external validation as merely demonstrative (no equation or output changed); mobile product navigation no longer wraps labels at 390 px.
Known limits: FarmEngine remains demonstrative and not authorized for livestock management decisions; BR-CORTE calculation is conditional on user-supplied ADG and stated Zebu/tropical-pasture domain and has no Riose calibration; behavioral generator remains NO-GO; independent external review is `NOT_PERFORMED`; no user interviews or willingness-to-pay validation were conducted. Accessibility review is not WCAG certification; screen-reader quality, high zoom, color contrast measurement and wider browser/OS matrix remain unverified.

Current disposition: capabilities ready for controlled demonstration are documented separately from decision-use capabilities. No external approval is claimed. Preserve P3-007 shared provider-spend gate, P3-008 independent domain-review gate, and behavioral NO-GO.
Next action: solicit real user evaluation of the narrow conditional DMI/cost use case and an independent reviewer for the scientific packet. Record their evidence and decisions in new review records; do not change gate status until its acceptance criteria are met.
Blocked dependencies: persistent provider-spend controls for P3-007; signed independent domain review and remaining quantitative-feature evidence for P3-008; new appropriately sampled and authorized behavior data for any future behavioral research.
