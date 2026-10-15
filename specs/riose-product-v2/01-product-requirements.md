# Product requirements

| ID | User-visible behavior; inputs → outputs | Dependencies | Failure state | Acceptance / science constraint | Status |
|---|---|---|---|---|---|
| PRD-001 | Open Product into a clear prompt-first experiment surface. | `product.html`, CSS, ES module | Missing script or empty page | Serve Product; no dependency on farm renderer. | DONE |
| PRD-002 | Describe population and comparison in natural language → editable intent. | intent parser or optional server adapter | Ask for missing inputs; show unsupported requests | Deterministic supported supplement example parses and is not auto-run. | DONE |
| PRD-003 | Review population, duration, baseline, intervention and assumptions → explicit confirmation. | validated intent | Invalid/out-of-domain spec blocks execution | No run before explicit Run confirmation. | DONE |
| PRD-004 | Execute baseline and intervention from same snapshot/seed → daily aggregates and population checkpoints. | population Worker command, JS FarmEngine | Worker error shown; no fake result | Daily aggregate parity with existing comparator. | DONE |
| PRD-005 | Explore population by day/indicator, filter and select stable ID → animal state. | compact observation contract | Unavailable metric is labeled | Cells are engine identities/states; no spatial meaning. | DONE |
| PRD-006 | Inspect selected animal and its bounded activity history → states/transitions and scenario delta. | retained checkpoints, projected final history | Incomplete history disclosed | No individual intake inferred from herd aggregate. | DONE |
| PRD-007 | View aggregates and provenance → weights, intake, stock, cost, activity and limitations. | engine metrics and provenance | Missing metric shown as unavailable | Distinguish illustrative engine values from validated biology. | DONE |
| PRD-008 | Amend one supported input in chat → stale result cleared and review updated. | amendment parser, explicit Run | Unsupported amendment explained | No silent rerun/intervention. | DONE |
| PRD-009 | Save/reopen/replay with manifest and seed → reproducible comparison. | existing local run history | Version incompatibility is explicit | Replay uses saved initial snapshot and seed; current implementation uses JS population runner. | DONE |
| PRD-010 | Export result JSON → manifest, comparison, observations and provenance. | result serialization | Serialization error shown | No invented fields. | DONE |
| PRD-011 | Work without LLM service → deterministic supported example. | bounded local parser | AI service unavailable is explicit | No simulated LLM response. | DONE |
| PRD-012 | Ask optional configured provider to extract intent → strictly validated schema. | server environment config | timeout/provider/schema errors fail closed to deterministic parser | API keys never reach browser; model cannot calculate or execute. | DONE |
| PRD-013 | Use responsive, keyboard-accessible interface and reduced motion. | semantic HTML/CSS | Layout adapts to narrow viewport | Mobile overflow and selection keyboard behavior checked. | DONE |
| PRD-014 | Use native Rust/WASM to produce per-animal checkpoint response. | Rust result/schema extension | Stay on JS population executor until parity exists | Not required for initial JS slice; native population observations are future work. | BACKLOG |
| PRD-015 | Render up to 10,000 returned animals smoothly in browser. | profiling, virtualization/Canvas | pagination fallback | 1,200 DOM cells per page; full browser heap/transfer benchmark pending. | BACKLOG |

All metrics remain scoped to current demonstrative FarmEngine unless a separately gated scientific model is explicitly selected.

| PRD-016 | Cancel a long population run → discarded partial results and preserved review spec. | dedicated Worker lifecycle | Current UI cannot cancel an executing run. | Future Worker termination test; no partial result/history entry. | BACKLOG |
