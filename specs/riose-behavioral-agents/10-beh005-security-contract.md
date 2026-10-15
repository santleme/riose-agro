# BEH-005 secure research assistant contract

**Status: frozen implementation scope.** This is a bounded, optional evidence assistant, not an autonomous scientific agent.

## Request and proposal

- Accept exactly `{message}` with a nonempty UTF-8 string up to 1,200 characters. Reject extra fields.
- Optional Groq, Hugging Face, or OpenAI adapter may produce only `riose-research-tool-plan/v1`: an optional clarification plus up to three tool proposals from a closed enum.
- The model has no provider-native function/tool execution. Proposal schema accepts only read-only `listEligibleBehaviorModels`, `searchScientificEvidence`, `draftBehaviorExperiment`, `validateBehaviorExperiment`, and `getBehaviorModelNoGoDiagnostic` calls.
- Reject malformed JSON, unknown fields/tool IDs, invalid arguments, excessive calls or oversize output. Do not retry. Provider timeout 5 seconds; output token cap 450; response body cap 4,000 characters.
- Provider receives only the bounded user message. Never upload the local evidence corpus, raw CSV, animal-level run data, model output, prompts from other users, or secrets.

## Deterministic dispatcher

The server dispatches tool IDs through hard-coded functions only:

1. `listEligibleBehaviorModels`: metadata only. Perea semi-Markov is `NO_GO`, research-only, and ineligible.
2. `searchScientificEvidence`: deterministic lexical retrieval over the repository's existing approved local corpus, top three snippets, bounded text, and source/line provenance.
3. `draftBehaviorExperiment`: local deterministic Product parser only; validates the result against existing scenario contract. It does not call or execute scientific models.
4. `validateBehaviorExperiment`: schema/domain validation only.
5. `getBehaviorModelNoGoDiagnostic`: reads the registered, deterministic Perea diagnostic and returns the frozen gate values, generated-sequence summary, source citations and limitations. It cannot alter model status or infer new metrics.

No LLM result can modify files, execute code, access network/shell, export raw data, change model status, or invoke a simulation. Execution confirmation uses a separate server action and schema; without confirmation return `confirmation_required`. Even with confirmation the current behavior model must fail closed with `behavior_model_not_eligible` and produce no run. Inspect-by-ID returns only a bounded server-known run; unknown IDs return not found.

## Output, provenance, and fallback

- Return structured tool outputs plus an audit envelope with request SHA-256, selected provider/model, executed allowlisted tool IDs, local source IDs/line locations, and result status. Do not echo provider keys, raw server errors, or the full user prompt in logs.
- No-key mode executes a deterministic, bounded local search or known local experiment draft and identifies `source=deterministic` / `provider_not_configured`.
- Provider/network/schema errors fall back to deterministic mode with a sanitized reason. No LLM-generated numeric measurement or free-form scientific result is returned.
- Rate limit each client address to 10 requests per rolling minute in-process; keep no prompt history. Response payload ≤ 16 KiB.
- This is a request/token bound, not a shared monetary budget. Provider remains disabled unless server-side configuration selects it; production deployment must add a persistent shared cost ceiling/alerts before enabling spendable credentials. Hugging Face `:cheapest` provider routing may change price/provider over time.

## Acceptance checks

- Provider-mocked OpenAI/Groq/HF tests verify server-only auth, strict structured request, timeout/token bound, and no provider-native tools or evidence snippets in the prompt.
- Negative tests cover prompt injection, unknown/execution tool IDs, extra request/tool fields, invalid tool args, oversized prompt/output, timeout/provider errors, rate limits, and absent credentials.
- Execution confirmation tests prove missing confirmation does not execute and confirmed-but-ineligible behavior requests still return no run.
- Deterministic retrieval and fallback must preserve citations and explicit no-go model status.
- A no-key request for the NO-GO explanation must return the server-registered metric values and source hashes without asking the LLM to write a scientific explanation.
