# Product V4 decisions

## P4-D-015 — Population journey before result dashboard (2026-10-16)

Decision: The default completed-run view is one paired mean-live-weight trajectory plus a plain-language selected-day comparison. Animal grid, filters, detailed aggregate cards, inspector, table and provenance are progressively disclosed. Remove FarmEngine's internally priced illustrative cost from Product results.

Reason: Product V3 browser review showed a dense dashboard and a pseudo-cost that could be confused with a user-entered economic estimate. The Product's organizing idea is a population moving through two scenario paths; the animal-level view supports investigation but should not compete with the primary question. The demonstrative engine may show its own computed states, clearly labeled, but its internal cost is not decision-grade cost.

Scientific constraint: The copy describes a computed engine difference only; it does not state that supplement caused a real cattle weight response. Conditional BR-CORTE CMS and any user-priced conditional economics remain separate model outputs. No metric is inferred per animal from an aggregate.

Follow-on: A checkpoint branch is valid only when exact engine state can be reconstructed from the original snapshot and seed. Compact observed rows are not sufficient to reconstruct a branch state. Require deterministic restoration, digest, lineage, shared seed and explicit confirmation before enabling such a branch.

## P4-D-016 — Reconstruct checkpoint branches instead of storing hourly states (2026-10-16)

Decision: A branch is reconstructed by replaying the parent manifest's selected arm in the Worker through the chosen checkpoint, then running the unchanged parent continuation and the declared one-factor alternative from the same resulting `FarmEngine` snapshot. The branch computes only after a second explicit action. Export includes the parent manifest, source arm, checkpoint day and digest, changed configuration, branch result, executor and result digest.

Evidence: A deterministic test verifies the unchanged branch arm's daily mean weights equal the original parent trajectory for every remaining day and that repeated branch runs are byte-equal. Browser E2E confirms that review does not post a Worker command, that explicit confirmation executes, export binds the parent/checkpoint/results, and replay reproduces the same checkpoint hash.

Limit: Branch rerun is available explicitly in the current Product session. The JSON export contains the parent manifest, branch inputs and calculated results, but importing it in a fresh session is not implemented here. No checkpoint is inferred from compact UI observations, and no full hourly snapshots are retained.

## P4-D-017 — Keep population paths visible while revealing them (2026-10-16)

Decision: Animate the decision paths with a short vertical transform only. Keep opacity at 1 throughout the transition and assert the baseline and intervention are both visible in the mobile browser flow.

Reason: The previous opacity-from-zero reveal made completed result cards appear absent in mobile captures taken during an animation or reduced-motion preference change. The motion added no information and hid the most important comparison.

Constraint: Values and path labels remain legible at every animation frame; reduced motion disables the transition. The paths continue to use actual FarmEngine observations and remain labeled demonstrative.

- P4-ADR-001: Extend Product V3's existing `/scenario-lab.html` and model registry. Do not create a parallel application or model registry.
- P4-ADR-002: Reuse P3 multi-arm comparison and P3 conditional supplement-cost calculations as complete capabilities; no new equivalent implementations.
- P4-ADR-003: The first new decision capability is a one-factor deterministic BR-CORTE Eq. 2.6 supplement sweep because it is mathematically supported, bounded by the existing model domain, and independent of the blocked paid-provider and commercial-review gates. It describes equation response only, not a cattle intervention effect.
- P4-ADR-004: FarmEngine and BR-CORTE outputs remain separate; the same visualization may not imply shared scientific status.
- P4-ADR-005: Empty scientific inputs are preferred to silent prefilled numbers; sample values must be explicitly loaded and labeled as examples.
- P4-ADR-006: Any LLM planning integration remains behind P3-007's persistent cost gate. Deterministic local validation and computation can ship without it.
- P4-ADR-007: BR-CORTE sensitivity uses its own v1 archive contract instead of changing the V3 scenario-set archive or the existing BR-CORTE scenario export. Reproduction is deterministic through the registered Eq. 2.6 implementation; `seed` is explicitly null because that calculation is not stochastic. Canonical hashes detect accidental/tampered content but are not signatures or evidence of scientific validity.
- P4-ADR-008: A valid sensitivity archive opens into review only. Recalculation requires the user's explicit Calculate action; imported expected output is compared canonically after re-execution.
- P4-ADR-009: The V4 conversational provider can only create the existing strict scenario intent. It has no execution tools or output channel for scientific values. Both server and client validate it; deterministic unsupported/missing checks are merged as a safety floor. Provider errors use the known local parser.
- P4-ADR-010: New scenario-lab exports use archive v2 to record interpreter identity. Archive v1 remains readable. A manual edit after interpretation keeps the initial proposal as provenance but labels the request `manual-revision`; the exact confirmed/executed values remain bound by the scenario manifest and digest. The v2 archive hashes are consistency checks, not signatures.
- P4-ADR-011: A rolling per-process/per-IP limiter reduces endpoint abuse only. It is not evidence of a shared cost ceiling and does not resolve P3-007. A single user-authorized non-production call remains distinct from enabling production provider traffic.

- P4-ADR-012: The user's latest explicit authorization permits a controlled non-production live test battery within actual provider quotas, without the former USD 0.10/one-call constraint or per-call confirmation prompts. Credentials can be injected through hidden stdin into volatile Node environment variables. No key files, literals, logs or browser/manifest secrets are permitted. P3-007 still governs shared production spend; P3-008 and behavioral NO-GO remain unchanged. This refines ADR-006/011 for the authorized manual test scope.
- P4-ADR-013: The generative model selects a strict input plan and evidence IDs. Authoritative scientific text and numeric differences are generated locally from registered limitations and explicit browser-run summaries. This constrains scientific hallucination and makes provenance reviewable without pretending model prose is a scientific result.
- P4-ADR-014: Missing-input and semantic authority belongs to the independent capability validator. Live Groq omission of required null keys is addressed with a complete schema template; irrelevant fields cannot block FarmEngine review. Shared units, numeric source/roles, explicit weather, price basis/currency and BR-CORTE domain remain independently checked.
- P4-ADR-015: Laya is a non-generative local classification experiment, not a chat endpoint. Pin SDK/checkpoint/artifact hashes, CPU eager execution and a frozen labeled fixture. Its final unsupported error and failed relative screen require EXPERIMENTAL_OFF. The lexical baseline was implemented after Laya outputs were visible, so comparative results are exploratory, not blinded/external validation. No candidate/threshold tuning followed final inspection.
- P4-ADR-016: Keep the original pinned Laya snapshot intact despite SDK tokenizer normalization, using a private config copy and linked large immutable artifacts. Never change expected hashes to make the second load pass. Actual cached offline inference establishes recoverability.
- P4-ADR-017: A valid existing experiment must export to a representation accepted by its own reader. Compact JSON plus a shared 64 MiB bound fixes the measured replay defect without changing model values or archive versions. Invalid import and provider failures preserve completed results; changed inputs revoke review authority and late replies are discarded.
- P4-ADR-018: The single-result BR-CORTE export advances from v1 to v2 to put every input/output unit in an explicit root map and state the residual-forage interpretation limit. The reader retains strict v1 compatibility and recomputes through the same registered implementation; this is a provenance/schema correction, not a formula or result change.
- P4-ADR-019: Product V4 cost is a separate versioned arithmetic record built only from explicit supplement DM supply, represented animal count, applicable full/branch horizon, user price, and currency. It must not consume FarmEngine's internal cost or be attached to BR-CORTE outputs. Editing price invalidates the displayed and persisted calculation; re-application is explicit and never re-runs the engine. Replay validates the stored arithmetic against its declared inputs and the recorded scenario manifest.
