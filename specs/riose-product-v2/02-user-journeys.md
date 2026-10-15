# User journeys and application states

Primary path: `EMPTY → COMPOSING → INTERPRETING → (NEEDS_CLARIFICATION | READY_FOR_REVIEW) → RUNNING → RESULTS → EXPLORING → REVISING`. Error and unsupported states preserve the prompt and never fabricate output. The current UI maps composing to prompt form, interpreting to an asynchronous status, clarification to a review card with missing fields, review to editable spec and Run button, execution to Worker status/progress, results/exploration to the population workspace, revision to follow-up that invalidates old results until explicit rerun.

| State/transition | Behavior | Current implementation | Recovery/test |
|---|---|---|---|
| `UNSUPPORTED_SCENARIO` from interpreting/review | Show unsupported fields and disable Run. | Yes; preserved in intent arrays and review card. | Remove/rephrase unsupported request; parser/API tests. |
| `ERROR` from interpreting/running | Show bounded error/status; retain prompt/spec for retry; never present partial result as complete. | Parser errors use live status; Worker/provider failures retain review. | Re-submit or confirm again; provider and Worker tests. |
| `CANCELLED` from running | Terminate the dedicated Worker, discard incomplete result, preserve reviewed spec and allow explicit retry. | Not implemented in this slice; Worker cancellation is backlog. | Future test must prove no result/history is committed. |
| `RECOVERING` to review | Reuse the preserved spec or local saved manifest after error/reload. | Local manifest replay and deterministic re-run exist. | E2E replay and run-history compatibility tests. |

| Journey ID | Steps | Failure/recovery | Acceptance |
|---|---|---|---|
| JRN-001 First-run | Open Product, select suggestion or type, interpret, review, confirm, explore grid and select animal. | Empty/invalid request stays in compose; unsupported request appears in review. | No execution occurs until Run; real engine IDs appear after completion. |
| JRN-002 Clarification | Describe supported population but omit supplement contrast. | Missing intervention is stated, not guessed; user can amend. | Review identifies required input. |
| JRN-003 Revision | Send supported duration/weather/supplement/count amendment after results. | Old analysis is hidden; no background rerun. | New inputs require explicit Run. |
| JRN-004 Replay | Select local history item. | Reject unsupported engine version. | Use stored manifest snapshot/seed/config and show replay metadata. |
| JRN-005 Provider failure | Provider absent, timeout, malformed response. | Deterministic parser is labeled as fallback; errors do not execute model output. | Prompt stays available and no API secret is sent client-side. |
| JRN-006 Accessibility/mobile | Keyboard-select cells and use timeline on small viewport. | Focus remains visible, semantic labels available. | Reduced-motion preference is honored; no horizontal page overflow at 390px. |
