# Risks and limitations

| Risk | Current handling | Follow-up |
|---|---|---|
| Demonstrative engine may be read as validated livestock prediction | Prominent unvalidated label; science limitations and provenance shown | UX review for comprehension |
| Long-running population work cannot yet be cancelled in the UI | No cancel control in this slice | Add dedicated Worker termination/retry lifecycle (P2-009) |
| Browser 10k run/payload is large and not profiled | Keep execution off main thread; show only 1,200 DOM cells initially; compact histories | Measure Worker transfer and memory in target browsers |
| Rust/WASM returns aggregate comparisons only | Product selects and labels JS executor | Implement native compact result contract and parity before switching |
| Parser has narrow grammar and language coverage | Explicit missing/unsupported output; no silent guess | Add only tested supported intents |
| LLM provider APIs/schema can change | Server-side strict validation, timeout, response limits, fallback | Provider contract smoke tests when configuration is enabled |
| Current “hot” switch is illustrative, not a validated heat-stress model | Show engine/weather caveat; no heat-stress outcome claims | Do not expand without evidence/model gate |
| Aggregate consumption/cost may be mistaken for individual values | Keep out of individual inspector; label aggregates and illustrative price assumptions | Review labels in user research |
| Local history depends on engine version compatibility and browser storage | Validate manifest compatibility before replay | Test quota/error recovery |
| Screenshots don't establish scientific validity | Keep separate from model evidence | Scientific review remains independent |
