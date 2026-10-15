# AI orchestration boundary

Reuse existing server-only provider adapters and limits. V3 changes the assistant from interpretation-only toward plan/retrieve/explain in small allowlisted steps.

Allowed tools may read capability metadata, validate a proposed manifest, run an explicitly confirmed registered executor, and retrieve a completed run by ID. The user confirms before any run. Tool outputs include provenance and actual calculated values; the model can only cite/format these values and must distinguish illustrative from scientific results.

Disallow arbitrary code/tools, direct provider tool execution, changing equations/data/thresholds, unbounded scenario expansion, hidden defaults, and LLM-authored measurements or uncertainty. Keep API keys server-only. A shared persistent monetary budget remains a deployment prerequisite for paid inference; the deterministic no-key path must remain functional.
