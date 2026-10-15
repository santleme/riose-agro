# AI orchestration

V4 local workflows work without a provider. Reuse P3-009's deterministic prompt draft and BEH-016's read-only evidence assistant. Proposed future tools are exact, server/client-validated schemas: list models, get applicability, create draft, validate, compare, sensitivity, conditional cost, inspect results, explain provenance.

Execution tools are never exposed to a model as autonomous authority: model proposals are validated, shown for review, and require explicit user confirmation. Providers cannot supply scientific numbers, alter equations/data, widen domain bounds, or control animals per tick. Unknown tools/fields and prompt injection fail closed. Keep Groq/Hugging Face optional and retain P3-007 BLOCKED until its persistent spend ceiling is real. No paid calls in this track without authorization.

## Product V4 prompt interpretation (P4-006)

`POST /api/interpret-scenario-lab` accepts exactly `{prompt}` (maximum 1,200 characters). If `LLM_PROVIDER=groq`, the server uses `GROQ_API_KEY` and defaults to `openai/gpt-oss-20b`, which Groq's current public documentation lists as supporting strict JSON Schema outputs. If `LLM_PROVIDER=huggingface`, the server uses `HF_TOKEN` and requires an explicitly configured `HF_MODEL`; model/provider structured-output availability varies and must be verified against the authenticated account. `LLM_MODEL` may override the provider-specific model. Credentials are never returned to the browser.

The adapter asks for only `riose-scenario-lab-intent/v1`, uses a strict schema, temperature 0, output cap 700 tokens, a 5 second timeout and no tool calls. The server parses JSON, applies the existing strict intent validator, and unions any deterministic-parser missing-input or unsupported-request findings. The browser validates again. Provider failures return sanitized errors; the page falls back to its deterministic parser. A per-process per-IP request limiter reduces abuse but is not a persistent or monetary budget. This does not unblock P3-007.

The user prompt remains untrusted content. A provider result only prepares a review draft. The existing separate `Run scenarios` action verifies the approved manifest digest before sending work to the Worker. Version 2 scenario archives retain interpretation source/provider/model and the original validated proposal. If a user edits scenario inputs, the archive records `manual-revision`: it preserves the original proposal, while the manifest binds the inputs actually confirmed and executed. Version 1 archives remain readable.

Current docs: [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [Groq supported models](https://console.groq.com/docs/models), [Hugging Face structured outputs](https://huggingface.co/docs/inference-providers/en/guides/structured-output). Public model support does not prove availability or entitlement for this account.
