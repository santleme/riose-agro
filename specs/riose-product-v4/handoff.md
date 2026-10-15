# Product V4 handoff

Date: 2026-10-15
Last verified implementation commit: `e72fa02` (P4-006 implementation and test commit); SDD/evidence recorded in `ee98869`.
Current branch: `codex/behavioral-agents-sdd` (local commits preserved; no push or merge).

Completed tasks: P4-001 through P4-006. P4-006 adds optional server-side Groq/Hugging Face structured interpretation, deterministic fallback, source/model status, and scenario archive v2 with interpreter provenance. Archive v1 stays readable. Manual edits preserve the original proposal and record `manual-revision`; the confirmed manifest remains tied to actual Worker inputs and result digest.

Task in progress: P4-007 live provider and Product V4 validation.
READY: no provider-dependent work can proceed until a secure credential is available; all local regression/E2E/parity work in this slice has been executed.
BLOCKED: P4-007 because `GROQ_API_KEY` and `HF_TOKEN` were absent from the current process environment and no secure runtime configuration control is exposed in this session. The user authorized a controlled battery within actual provider quotas/rate limits, with bounded requests and no per-call approval prompt; no provider request has occurred. P3-007 remains BLOCKED for production/shared usage because the persistent shared spend ceiling is still absent. P3-008 remains BLOCKED pending independent scientific review. Behavioral semi-Markov remains NO-GO.

Files changed: `src/server/scenario-lab-ai.js`, `src/server/server.js`, `src/client/scenario-lab-app.js`, `src/client/scenario-lab-integrity.js`, `scenario-lab.html`, `tests/scenario-lab-ai.test.js`, `tests/scenario-lab-integrity.test.js`, `tests/app.test.js`, `scripts/e2e/scenario-lab.mjs`, `scripts/e2e/scenario-lab-ai.mjs`, `package.json`, V4 task/progress/acceptance/AI/decision/handoff documents, and refreshed local Chromium screenshots for Product V3/V4 Scenario Lab.

Tests executed:

- `node --test tests/scenario-lab-ai.test.js tests/scenario-lab-integrity.test.js tests/experiment-intent-api.test.js tests/scenario-lab-intent.test.js`: PASS (24 tests at that point).
- `npm run test:e2e:scenario-lab`: PASS; FarmEngine runs only after explicit confirmation, cancellation works, 390 px mobile has no overflow, no console errors.
- `npm run test:e2e:scenario-lab-ai`: PASS; provider fixture → review → explicit run → v2 provenance export → open without run → explicit replay. No provider contacted.
- `npm run test:e2e:product`: PASS; Product V2 flow and local replay.
- `npm test`: PASS, 510/510.
- `npm run test:parity`: PASS; pasture seed 417 (24 checkpoints), housing seed 2026 (1,440 hourly checkpoints, 31 daily rows).
- `git diff --check`: PASS before commit.

Latest independent recheck on 2026-10-15: `npm test` PASS 510/510; `npm run test:e2e:scenario-lab-ai` PASS using the explicit fixture route (no provider contacted); `npm run test:e2e:scenario-lab` PASS (3 arms, cancellation, sensitivity, mobile 390 px, zero console errors); `npm run test:e2e:product` PASS (explicit paired run, inspection/export, revision/re-run, replay, mobile); `npm run test:parity` PASS (pasture seed 417 / 24 checkpoints; housing seed 2026 / 1,440 hourly checkpoints / 31 daily rows). First fixture E2E attempt failed because the local server was not running; starting `npm start` and rerunning passed.

Secure provider status: Presence-only check found `GROQ_API_KEY`, `HF_TOKEN`, `LLM_PROVIDER`, `GROQ_MODEL`, `HF_MODEL`, and `LLM_MODEL` absent from the current process environment. No authenticated model discovery or live inference occurred. No chat-pasted credential was used. The user now authorizes a controlled live test battery within actual available provider quotas/rate limits; this does not enable production traffic or remove P3-007's persistent shared budget gate. Groq's public docs currently list `openai/gpt-oss-20b` as strict JSON Schema capable; account availability remains unverified. HF model/provider availability is account-specific and unverified.

Scientific limitations: V4 intent is only a scenario draft. FarmEngine remains demonstrative; BR-CORTE remains a separate conditional Eq. 2.6 calculation and does not predict gain. Perea semi-Markov NO-GO unchanged. No scientific equations, behavior, or result values changed. API rate limiting is process-local abuse control, not a shared cost ceiling.

Visual evidence: local Chromium screenshots are in `docs/evidence/product-v3-scenario-lab-initial.png`, `docs/evidence/product-v3-scenario-lab-results.png`, and the existing refreshed Product V4 screenshot set. The T3 preview reported no automation host; its tool instructed not to retry. Local Chromium E2E was used instead.

Next action: make `GROQ_API_KEY` or `HF_TOKEN` available to the server through the secure runtime configuration, with `LLM_PROVIDER` selecting the configured provider (Groq defaults to `openai/gpt-oss-20b`; Hugging Face requires `HF_MODEL`). Then verify account/model availability and execute the bounded live scenario battery, followed by real Product interpretation → review → explicit local execution → explanation → export → replay. Do not enable production provider traffic or mark P3-007 resolved. No push, merge, deployment, or external outreach.
