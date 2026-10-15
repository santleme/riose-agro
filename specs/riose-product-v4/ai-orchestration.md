# AI orchestration

V4 local workflows work without a provider. Reuse P3-009's deterministic prompt draft and BEH-016's read-only evidence assistant. Proposed future tools are exact, server/client-validated schemas: list models, get applicability, create draft, validate, compare, sensitivity, conditional cost, inspect results, explain provenance.

Execution tools are never exposed to a model as autonomous authority: model proposals are validated, shown for review, and require explicit user confirmation. Providers cannot supply scientific numbers, alter equations/data, widen domain bounds, or control animals per tick. Unknown tools/fields and prompt injection fail closed. Keep Groq/Hugging Face optional and retain P3-007 BLOCKED until its persistent spend ceiling is real. No paid calls in this track without authorization.
