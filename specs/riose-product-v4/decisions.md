# Product V4 decisions

- P4-ADR-001: Extend Product V3's existing `/scenario-lab.html` and model registry. Do not create a parallel application or model registry.
- P4-ADR-002: Reuse P3 multi-arm comparison and P3 conditional supplement-cost calculations as complete capabilities; no new equivalent implementations.
- P4-ADR-003: The first new decision capability is a one-factor deterministic BR-CORTE Eq. 2.6 supplement sweep because it is mathematically supported, bounded by the existing model domain, and independent of the blocked paid-provider and commercial-review gates. It describes equation response only, not a cattle intervention effect.
- P4-ADR-004: FarmEngine and BR-CORTE outputs remain separate; the same visualization may not imply shared scientific status.
- P4-ADR-005: Empty scientific inputs are preferred to silent prefilled numbers; sample values must be explicitly loaded and labeled as examples.
- P4-ADR-006: Any LLM planning integration remains behind P3-007's persistent cost gate. Deterministic local validation and computation can ship without it.
- P4-ADR-007: BR-CORTE sensitivity uses its own v1 archive contract instead of changing the V3 scenario-set archive or the existing BR-CORTE scenario export. Reproduction is deterministic through the registered Eq. 2.6 implementation; `seed` is explicitly null because that calculation is not stochastic. Canonical hashes detect accidental/tampered content but are not signatures or evidence of scientific validity.
- P4-ADR-008: A valid sensitivity archive opens into review only. Recalculation requires the user's explicit Calculate action; imported expected output is compared canonically after re-execution.
