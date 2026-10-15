# Product V4 handoff

Date: 2026-10-15
Last verified implementation commit: `e72fa02` (P4-006 implementation and test commit); SDD/evidence recorded in `ee98869`.
Current branch: `codex/behavioral-agents-sdd` (46 commits ahead of origin after local commits; no push or merge).

Completed tasks: P4-001 through P4-006. P4-006 adds optional server-side Groq/Hugging Face structured interpretation, deterministic fallback, source/model status, and scenario archive v2 with interpreter provenance. Archive v1 stays readable. Manual edits preserve the original proposal and record `manual-revision`; the confirmed manifest remains tied to actual Worker inputs and result digest.

Task in progress: none.
READY: none without a secure credential for the one-off live test or a new independent requirement.
BLOCKED: P4-007 live provider validation (the user authorized one request up to USD 0.10, but no secure provider key is configured). P3-007 remains BLOCKED for production-wide use because the persistent shared spend ceiling is still absent. P3-008 remains BLOCKED pending independent scientific review. Behavioral semi-Markov remains NO-GO.

Files changed: `src/server/scenario-lab-ai.js`, `src/server/server.js`, `src/client/scenario-lab-app.js`, `src/client/scenario-lab-integrity.js`, `scenario-lab.html`, `tests/scenario-lab-ai.test.js`, `tests/scenario-lab-integrity.test.js`, `tests/app.test.js`, `scripts/e2e/scenario-lab.mjs`, `scripts/e2e/scenario-lab-ai.mjs`, `package.json`, V4 task/progress/acceptance/AI/decision/handoff documents, and refreshed local Chromium screenshots for Product V3/V4 Scenario Lab.

Tests executed:

- `node --test tests/scenario-lab-ai.test.js tests/scenario-lab-integrity.test.js tests/experiment-intent-api.test.js tests/scenario-lab-intent.test.js`: PASS (24 tests at that point).
- `npm run test:e2e:scenario-lab`: PASS; FarmEngine runs only after explicit confirmation, cancellation works, 390 px mobile has no overflow, no console errors.
- `npm run test:e2e:scenario-lab-ai`: PASS; provider fixture → review → explicit run → v2 provenance export → open without run → explicit replay. No provider contacted.
- `npm run test:e2e:product`: PASS; Product V2 flow and local replay.
- `npm test`: PASS, 510/510.
- `npm run test:parity`: PASS; pasture seed 417 (24 checkpoints), housing seed 2026 (1,440 hourly checkpoints, 31 daily rows).
- `git diff --check`: PASS before commit.

Secure provider status: `GROQ_API_KEY`, `HF_TOKEN`, provider/model environment values were absent when checked. No authenticated model discovery or live inference occurred. The token pasted in chat is considered exposed; revoke it with the provider and supply a new token through secure environment configuration only. Do not use or repeat the chat value. Groq's public docs currently list `openai/gpt-oss-20b` as strict JSON Schema capable; account availability remains unverified. HF requires account-specific model/provider verification; V4 refuses a default HF model.

Scientific limitations: V4 intent is only a scenario draft. FarmEngine remains demonstrative; BR-CORTE remains a separate conditional Eq. 2.6 calculation and does not predict gain. Perea semi-Markov NO-GO unchanged. No scientific equations, behavior, or result values changed. API rate limiting is process-local abuse control, not a shared cost ceiling.

Visual evidence: local Chromium screenshots are in `docs/evidence/product-v3-scenario-lab-initial.png`, `docs/evidence/product-v3-scenario-lab-results.png`, and the existing refreshed Product V4 screenshot set. The T3 preview reported no automation host; its tool instructed not to retry. Local Chromium E2E was used instead.

Next action: after a new key is safely provisioned, use only the already-authorized single manual interpretation request (maximum USD 0.10), verify the selected account model, then complete Product V4 review → explicit FarmEngine execution → export → replay. Do not enable production provider traffic or mark P3-007 resolved. No push, merge, deployment, or external outreach.
