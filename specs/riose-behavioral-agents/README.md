# Riose Behavioral Agents — SDD v0.1

**Status:** SDD initialized; no behavioral model has been validated or enabled.
**Started:** 2026-10-15.
**Parent:** Product V2 PR #190, head `983d0d7259fb01fcdc7c279cd059eeb5eaaf72bc`. This is a follow-on branch; do not merge into `main` until Product V2 dependencies land or the review is explicitly retargeted.
**Target:** evidence-grounded cattle behavior generation, opt-in only, with conversational research orchestration.

## Scientific constitution
1. Recognizing observed activity from accelerometer signals, generating plausible sequences, and predicting intervention response are **three different tasks**; never claim a higher level was validated from a lower-level evaluation.
2. Scientific behavior generation is NOT an LLM call per animal per tick. Groq / Hugging Face serve the research assistant and approved tool orchestration; a versioned local statistical policy samples animal behavior deterministically from a seeded random stream.
3. Compare against animal-held-out observations before proposing integration; no eligible external pasture dataset is yet approved for direct validation. No automatic production promotion.
4. Preserve Perea's observed four-class ontology (WA, GR, RE, RU), while the demo FarmEngine has a different activity ontology (grazing, feeding, drinking, resting). Never silently equate classes.
5. Never infer DMI, ADG, weight, water access, intervention response, or individual animal health from behavior classification/generation alone.
6. Any domain coupling to intake/metabolism requires new separate specs and evidence. The existing FarmEngine and Product V2 remain unchanged by this SDD initialization.
7. Each artifact has a version, dataset/source/checksum, split methodology, seed, feature availability, population, limitations and explicit status.
8. Respect scientific data rights and source permissions; absence of an explicit license is not permission to train or redistribute in a commercial pipeline.

## Required reading
- [Scientific evidence](02-evidence-inventory.md)
- [Behavioral ontology and policy](03-behavioral-model.md)
- [Preregistered evaluation protocol](04-validation-protocol.md)
- [Agent orchestration](05-ai-orchestration.md)
- [Product/visual integration](06-product-integration.md)
- [Task queue](tasks.md)
- [Autonomous SDD loops](RUN_LOOP.md)
- [Session handoff](handoff.md)

## Scope of initial PR
Specification + reproducible development instructions only. It does **not** assert scientific performance, complete tests, deploy trained models or modify production simulation outcomes. Next action: BEH-001 data/readiness audit with programmatic tests, then BEH-002 frozen baselines.
