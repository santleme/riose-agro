# Language selection

| Domain | Choice | Reason and change trigger |
| --- | --- | --- |
| Product interface and orchestration | JavaScript, HTML, CSS | Existing web stack; small modules remain easy to inspect and execute locally. |
| Isolated simulation execution | JavaScript module Worker | Keeps long runs off the UI thread and preserves the browser fallback. |
| Deterministic numeric kernel | Rust with optional WASM/native adapters | Shared source and explicit ABI; keep only where equivalence and workload measurements support it. |
| Scientific analysis and data processing | Python | Mature statistics and data ecosystem; use project-specific requirements for research tasks. |
| Storage | JSON/CSV and browser-local history | Portable current contracts; add a database only when retention, concurrency, or query needs justify it. |

A language or platform change is an implementation decision supported by reproducibility and measured workload benefits, not a product objective by itself.
