# Hybrid AI integration and frozen routing evaluation v1

This extends P4-006/007 and reuses V3 scientific/execution contracts. Groq interprets language; Hugging Face distributes the pinned Laya weights; the optional Laya CPU worker makes structured classifications only. The independent validators and explicit review/run actions remain authoritative. No new animal model or equation is introduced.

## P4-007 live integration acceptance

Verify credentials through official authenticated APIs without recording credentials, account identity or authorization headers. Record selected model, real response status, latency and usage when returned. Exercise clarification, three-arm comparison, BR-CORTE applicability, scientific explanation, unsupported behavior, revision, failure recovery and an actual browser review/run/export/replay. A real inference is required; fixture results cannot satisfy this gate. User authorization covers a bounded manual battery within account quota. Production shared-spend gate P3-007 is unchanged.

## P4-008 routing experiment, specified before model evaluation

Fixture: `tests/fixtures/intent-routing-v1.json`. Eight exclusive dominant-intent labels, in English and Portuguese. `clarification_needed` means that the desired operation is itself unclear; missing numeric inputs do not change an otherwise explicit comparison into a different intent. `scientific_explanation` includes asking whether a model can forecast something; `unsupported_request` is a request to produce such an unavailable forecast or bypass execution safeguards.

There are 16 development and 16 final-test prompts, one PT and one EN example per label per split. These are developer-authored smoke cases, not representative user or external validation data. Labels are frozen before any Laya inference. Record the fixture SHA-256. Do not adapt wording, instructions, weights or thresholds using final-test observations. No fine-tuning. Argmax only; scores are not calibrated probabilities.

Compare (1) a documented conservative deterministic routing wrapper around the existing parser, (2) Laya multilingual 322M, pinned model revision and SDK, CPU eager inference, and (3) Groq strict-schema classification with the same label definitions. Preserve raw per-case predictions, duration, failure and confusion counts, accuracy, macro F1 and per-class recall. Failed calls count as errors. Keep development and final metrics separate. Remote requests have finite time/token caps, no automatic retries and conservative pacing; abort on authentication, quota or repeated rate errors.

Predefined promotion screen: Laya must strictly exceed the deterministic wrapper on both final accuracy and macro F1, make no false-supported routing of `unsupported_request`, and have measured CPU p95 inference below 1,000 ms. This small screen can reject a candidate, but cannot by itself approve production routing; real user coverage and domain calibration remain unperformed. Default routing remains OFF. Router decisions never reject scientific capabilities, run tools or authorize execution.

Measure model initialization separately from first download, cold prediction and subsequent inference; report process maximum RSS and retained RSS when available, platform and CPU thread count. Do not infer GPU performance. Install in a Python venv outside the repository, CPU-only torch; use safetensors and the official SDK, not Chat Completions. Model/download failures do not block Groq or deterministic operation.

## P4-009 grounded decision conversation

Add only missing Product conversation behavior: a strict versioned planning envelope for registered capabilities, explicit missing inputs, scientific evidence requests, and result inspection. Numerical results come from existing registered-model calculations or supplied completed results; no free-form scientific output channel from a model. Validate both the server proposal and client review. Requests and revisions prepare forms/reviews only. Show actual provider/fallback identity, preserve the existing draft/archive format and calculation/export/replay paths.
