# Product V3 architecture

## Separation of responsibilities

- UI: scenario editor, review, charts, population projection and provenance. Reuse vanilla JS/HTML/CSS and Product V2 components.
- Versioned experiment contracts: a V3 scenario-set contract for 3+ arms; do not change V2 pair manifests or old replay semantics.
- Execution: browser Worker for FarmEngine population scenarios; dedicated registered scientific model executor for BR-CORTE Eq. 2.6. Do not route BR-CORTE outputs through FarmEngine's metabolism or weather rules.
- Scientific registry: retain model ID/version, inputs/units, output units, equation/source, domain, validation evidence, limits, implementation hash and execution status.
- History/export: store the exact input manifest, seed, executor/model version, scenario results and deterministic replay metadata. Preserve existing V2 history readers.
- AI: server-side planner/explainer uses allowlisted retrieval and validated contracts. It does not execute code or generate numbers.

## V3 scenario-set contract

`riose-scenario-set/v1` contains a stable experiment ID, `validated:false`, engine version, immutable initial snapshot, seed, duration, common factor, and 3–10 uniquely identified named scenarios. Exactly one is the reference; each other arm changes only the same declared factor and has a unique factor value. Replay starts every arm from the identical snapshot and seed. Unknown fields and versions fail closed.

## Sensitivity

Sensitivity runs explicit input points through the selected deterministic evaluator. Record the method, changed input, units, base point, complete tested values, output and arithmetic delta. Never infer uncertainty or confidence from an input sweep.

## Resource controls

Keep expensive FarmEngine sweeps in Workers. Add cancellation before expanding scenario count/horizon. Bound scenarios, animals, days, checkpoints, retained history and exported payload. Native Rust/WASM population use requires parity for the full V3 output contract; until then identify the actual JS executor.
