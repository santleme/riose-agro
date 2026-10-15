# AI research orchestration — Groq + Hugging Face

## Separation of responsibilities
- **Groq:** optional low-latency conversational plan drafting, scientific retrieval summaries and tool-selection proposals via a compatible model.
- **Hugging Face:** discover and host versioned research model artifacts, model cards, and optionally route text inference providers; use pinned model revisions and verify provider availability. Hugging Face is not a substitute for scientific validation.
- **Local JS/Rust/Python:** run deterministic agents, scientific models, metric evaluation and data preparation. No per-animal-per-tick LLM.
- Support a deterministic/no-key path. Never require paid inference to operate existing Product V2.

## Proposed bounded tool catalog (allowlist)
1. `listEligibleBehaviorModels()` — metadata only: version, labels, domain, data rights, evaluation status.
2. `searchScientificEvidence(query)` — existing approved repo retrieval, source IDs + line references.
3. `draftBehaviorExperiment(intent)` — pure plan with explicit scope and assumptions.
4. `validateBehaviorExperiment(spec)` — schema + permissions + domain + eligibility gates.
5. `requestBehaviorExperimentExecution(spec)` — may execute ONLY after server-side validation AND explicit user confirmation; experimental opt-in only.
6. `inspectBehaviorExperiment(runId)` — returns only stored bounded result and provenance.
Never give LLM arbitrary shell, network, repository mutation, policy publication, raw dataset export or scientific-model promotion tools.

## Server adapter
- Keep provider keys server-side; never expose `HF_TOKEN` or `GROQ_API_KEY` to browser, logs or archives.
- Model names and provider URLs are configuration, not hard-coded guarantees; verify current provider/model structured-output and tool support in official docs before coding.
- Validate every JSON response with schema; reject unknown keys, unsupported enums, unapproved models, external URLs and arbitrary tool calls.
- Enforce request size, response cap, budget/timeout, rate limits, idempotency tokens, retry bounds and provenance.
- Treat user text and retrieved documents as untrusted. Prompt injection cannot bypass tool authorization, eligibility checks or execution confirmation.
- Do not upload restricted raw data to external inference services without explicit authorization and checked rights.
- Distinguish tool-generated measured numbers from LLM narrative; assistant cannot fabricate missing data.

## Conversation UX
Product retains minimal white/off-white editorial design. Behavior option appears as a research capability only if an evaluated experimental policy exists. Clearly label `observed`, `classified`, `generated-experimental`, `legacy-demo` with accessibility-safe text and legend; no calibrated confidence claim.
