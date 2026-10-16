# Product V3 architecture

## Separation of responsibilities

- UI: scenario editor, review, charts, population projection and provenance. Reuse vanilla JS/HTML/CSS and Product V2 components.
- Versioned experiment contracts: a V3 scenario-set contract for 3+ arms; do not change V2 pair manifests or old replay semantics.
- Execution: browser Worker for FarmEngine population scenarios; dedicated registered scientific model executor for BR-CORTE Eq. 2.6. Do not route BR-CORTE outputs through FarmEngine's metabolism or weather rules.
- Scientific registry: retain model ID/version, inputs/units, output units, equation/source, domain, validation evidence, limits, implementation hash and execution status.
- History/export: store the exact input manifest, seed, executor/model version, scenario results and deterministic replay metadata. Preserve existing V2 history readers.
- Confirmation integrity: hash the canonical reviewed V3 manifest; send that digest with the explicit replay command; recompute it inside the Worker; require the echoed digest and result dimensions/arms/identities to match before rendering. Any input or prompt edit invalidates the active review and requires a new review and explicit confirmation.
- V3 export: `riose-scenario-lab-archive/v1` binds the source question/intent relationship, exact manifest, outputs and provenance with SHA-256 digests. Reopen verifies hashes and semantics before showing review; it does not execute. A subsequent explicit replay must match the archived result canonically or results remain withheld. Older `{manifest,results}` V3 exports remain readable and are also checked against replay; persisted V2 contracts are unchanged.
- AI: server-side planner/explainer uses allowlisted retrieval and validated contracts. It does not execute code or generate numbers.

## V3 scenario-set contract

`riose-scenario-set/v1` contains a stable experiment ID, `validated:false`, engine version, immutable initial snapshot, seed, duration, common factor, and 3–10 uniquely identified named scenarios. Exactly one is the reference; each other arm changes only the same declared factor and has a unique factor value. Replay starts every arm from the identical snapshot and seed. Unknown fields and versions fail closed.

## Review, execution and archive binding

The canonical manifest SHA-256 is calculated when review is created and recomputed in the Worker before replay. The Worker echoes the digest it received. The client requires equality with the reviewed digest, then checks executor, engine version, seed, horizon, factor, ordered arm identities/configs, units, daily rows, checkpoint identities and `validated:false` status. Exported archives record confirmed and executed digests plus a result digest. The hash detects changed bytes; it is not a signature or proof against someone who rewrites the archive and recomputes its hashes. Deterministic replay comparison is the output-integrity check.

## Sensitivity

Sensitivity runs explicit input points through the selected deterministic evaluator. Record the method, changed input, units, base point, complete tested values, output and arithmetic delta. Never infer uncertainty or confidence from an input sweep.

## Resource controls

Keep expensive FarmEngine sweeps in Workers. Add cancellation before expanding scenario count/horizon. Bound scenarios, animals, days, checkpoints, retained history and exported payload. Native Rust/WASM population use requires parity for the full V3 output contract; until then identify the actual JS executor.
