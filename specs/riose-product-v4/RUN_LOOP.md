# Product V4 SDD run loop

At session start: inspect branch, HEAD, dirty state, applicable instructions; read this directory's tasks/progress/decisions/handoff and current V2/V3/behavioral references; verify local code and test status instead of trusting notes.

For each task:

1. Select highest-priority READY task with satisfied dependencies.
2. Inspect public interfaces and scientific contract.
3. State the user-visible acceptance behavior and test seam in the task record.
4. Add one failing behavioral test, implement the smallest vertical slice, and rerun the focused test.
5. Run affected V2/V3/E2E/parity/full regressions.
6. Inspect the real UI for visual changes; record viewport/captures or tool limitation.
7. Check outputs, units, model domain, provenance and claims. Software tests are not model validation.
8. Record actual commands, results, evidence and limitations in progress; update task, decisions and handoff.
9. `git diff --check`, review diff/status, then commit one coherent verified slice.
10. Continue to the next eligible READY task; preserve gates and never push/merge without explicit request.

After three materially similar failures, stop repeating and diagnose an alternative. Mark BLOCKED only with a concrete external dependency; continue independent work. Never fabricate user feedback, scientific metrics, benchmark results, or external review.
