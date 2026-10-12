# ADR 0002: First Rust slice is a batch metabolism update

- **Status:** Accepted as an opt-in measurable prototype, not a performance decision
- **Problem:** The existing hourly engine has a small deterministic weight/energy calculation per animal. A Rust slice must be comparable and usable without moving the rest of the model.
- **Alternatives:** Port all `FarmEngine`; add ECS now; keep all rules in JS; move only the independent post-intake weight/energy formula behind a batch API.
- **Choice:** Implement the last option in `riose-core`, compile it for native and `wasm32-unknown-unknown`, invoke one batch per hour in the existing Worker when `?engine=wasm` is selected, and preserve JS as default and fallback.
- **Justification:** Intake and resting state are already computed by JS; after those inputs are fixed, outputs are independent per animal. Batch buffers limit call count and preserve JS-side scenario and world behavior.
- **Consequences:** Inputs/outputs are copied across the WASM ABI. The current bridge is slower in the isolated kernel benchmark and has no consistent end-to-end advantage. Native Rust is faster in the isolated kernel benchmark, but no full native runner exists yet. This does not establish a need to migrate more code. Formula and ordering must remain exact.
- **Rollback:** Worker selects `updateMetabolismJS`; saved JSON snapshots and manifest v1 are unaffected. The JS implementation and tests remain available.
