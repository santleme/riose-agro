# Testing strategy

Preserve the current 497-test suite as the baseline recorded by P3-011; remeasure the actual checkout before changes. For P4 sensitivity test public request/response seams: schema, valid worked values, exact intervals, boundaries, bad units/shapes, invalid increments, point cap, fixed-input invariants, results/provenance and deterministic replay. Use independently sourced Eq. 2.6 reference fixture, not a second copy of implementation arithmetic.

For UI use local Playwright E2E: blank initial state, explicit example, review values, no auto-run, confirmation, actual result table/curve, keyboard/reduced-motion/mobile and export/replay. Run Product V2/V3 E2E and full `npm test`; run JS/Rust parity only when shared engine code changes. Browser benchmarks only for measurable performance changes and compare before/after with same harness/configuration. Tests establish software behavior, not model validity.
