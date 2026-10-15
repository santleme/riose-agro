# Riose Product V3 — Scientific Scenario Laboratory

## Purpose

Extend Product V2 into a practical scenario laboratory without treating the default FarmEngine as a validated livestock predictor. Product development and behavioral research proceed independently; BEH-004's behavioral NO-GO remains unchanged.

## Source of truth

This track extends rather than replaces [`specs/riose-product-v2/`](../riose-product-v2/). Reuse its product journeys, design system, worker protocol, population observations, scenario replay and history contracts unless a versioned V3 contract is required. Keep `experiments.html` and its legacy flow compatible.

Product V3 separates calculation surfaces:

1. **Illustrative FarmEngine scenarios:** deterministic, reproducible demonstrations, visibly marked unvalidated and unsuitable for management decisions.
2. **Scientific calculators:** a model is available only within its declared population, inputs, units and evidence status. BR-CORTE 2023 Eq. 2.6 may estimate DMI for growing Zebu cattle on tropical pasture when BW, supplement and ADG are supplied. It does not predict ADG or animal weight trajectory.

The central user flow is: configure a question → review three or more comparable scenarios → run → inspect sensitivity and population-level outputs → reproduce or export with provenance.

## Development rules

- Read `tasks.md`, `progress.md`, `decisions.md`, `risks.md`, and `handoff.md` at each resume.
- Do not turn a FarmEngine result into a scientific claim by improving its interface.
- Keep sensitivity deterministic, unit-aware and explicit about which inputs change.
- Every arm in a scenario set uses one immutable starting snapshot and seed. Results include the exact changed factor and engine/model version.
- An AI provider can propose and explain bounded experiment plans; only server/client validators and registered deterministic executors can calculate results.
- No behavioral generator is in this product dependency chain.
- Do not claim commercial readiness until a defined quantitative feature passes the separate scientific and domain-review gate in `04-scientific-gates.md`.

## Current status

V3 requirements are defined. P3-001 audit/rescope, P3-002 multi-scenario contract, P3-003 scenario-lab UI/Worker, and P3-005 cancellation are complete on the separate `/scenario-lab.html` route. Product V2 remains available unchanged except for a navigation link, and FarmEngine defaults are unchanged. P3-004 BR-CORTE calculator is next.
