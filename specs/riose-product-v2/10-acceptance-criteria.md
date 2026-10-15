# Acceptance criteria

| ID | Criterion | Evidence |
|---|---|---|
| ACC-001 | User can open Product, type a known prompt, and review parsed inputs before execution. | Playwright workspace screenshot + intent tests |
| ACC-002 | Missing/unsupported inputs are visible; no paid LLM is needed for one supported experiment. | parser tests + no-key endpoint test |
| ACC-003 | Explicit confirmation runs two real deterministic engine arms from same snapshot/seed. | paired comparison test and result manifest |
| ACC-004 | Grid uses returned IDs/states and timeline shows only computed checkpoints. | Worker/UI E2E |
| ACC-005 | Selecting an animal reveals engine states, paired difference, and bounded activity history. | history projection test + browser E2E |
| ACC-006 | Difference is intervention minus baseline for same identity/day; aggregate values stay aggregate. | exact delta/parity tests, labels |
| ACC-007 | Scientific limitations and provenance are visible; unsupported scientific outcomes remain unavailable. | parser and provenance tests |
| ACC-008 | Local history replays stored snapshot/seed/config with compatible engine version. | history replay test |
| ACC-009 | Product has no old farm renderer dependency; old Experiments workflow remains served. | HTML/module test |
| ACC-010 | Full regression and JS/Rust parity tests pass. | CI command outputs |
| ACC-011 | LLM failures are bounded, server-only, validated, and fail closed. | API test suite |
| ACC-012 | Mobile page has no horizontal overflow and reduced motion/keyboard states work. | local browser check |

Status: ACC-001–012 pass for the implemented vertical slice as recorded in `progress.md`; gaps in native per-animal Rust output and 10k browser memory profiling are explicit follow-up work, not claims of acceptance for those capabilities.
