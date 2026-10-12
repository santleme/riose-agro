# ADR 0001: Polyglot modules stay in-process until measured otherwise

- **Status:** Accepted for the initial V2 slice
- **Problem:** Rust, Python, JS and future native libraries need to coexist without multiplying service operations or coupling models to presentation.
- **Alternatives:** Rewrite the product in Rust; make each language a microservice; use versioned in-process adapters and batch files/messages.
- **Choice:** Keep UI/orchestration in JS, scientific exploration in Python, and introduce Rust only as a reusable deterministic kernel behind a batch ABI. No new service boundary.
- **Justification:** Existing browser Worker and local server already separate UI work from simulation. The kernel data fit a batch interface. No evidence requires remote deployment.
- **Consequences:** One Rust/WASM build artifact and ABI must be versioned and tested. Language interoperability remains a maintenance cost. Future service split stays possible if deployment or scaling needs appear.
- **Rollback:** Stop loading the Rust kernel and use the retained JS fallback; remove the crate only in a later approved cleanup after saved behavior remains covered.
