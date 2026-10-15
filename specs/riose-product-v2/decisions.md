# Decisions

- DEC-001: Keep vanilla ES modules/HTML/CSS and Worker architecture; no framework migration.
- DEC-002: Make Product V2 separate from `experiments.html`; preserve the established experiment form and its contract/history.
- DEC-003: Initial population runner is JS-only because existing native comparison returns aggregates, not per-animal observations. Do not suggest Rust produced the population grid.
- DEC-004: Use deterministic bounded parser as no-cost baseline. Optional server provider can only extract contract fields and cannot return scientific outcomes.
- DEC-005: Pair arms from one snapshot and seed, changing exactly one engine-supported factor; represent only model-computed days.
- DEC-006: Retain a bounded compact population projection and activity history to control payload. No complete hourly physiological histories.
- DEC-007: Cell identity is an animal ID arranged as an observation matrix; patch is not mapped geography.
- DEC-008: Keep species/breed requested as descriptive metadata only; never imply model transport to Nelore.
- DEC-009: Use explicit unavailable/limitation text rather than fill missing biological metrics.
- DEC-010: Browser E2E uses local headless Chromium because T3 preview host was explicitly unavailable in this environment.
