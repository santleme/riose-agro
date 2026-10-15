# Codex autonomous SDD loop — behavioral agents

At the start of *every* new Codex session:
1. Read applicable repository `AGENTS.md`, git status, PR #190 dependency and branch head.
2. Read this README, requirements, evidence inventory, model spec, validation protocol, tasks, progress and handoff.
3. Check actual code and data before assuming an earlier task is complete.
4. Select the first READY unblocked task. Keep each task's acceptance criteria and negative scientific gates intact.

For each active task:
```
SPEC → INSPECT → DEFINE FAILING TEST / CHECK → IMPLEMENT
    → TEST → INDEPENDENT SCIENTIFIC EVIDENCE CHECK
    → (UI only: BROWSER + VISUAL INSPECTION)
    → DOCUMENT RESULTS + LIMITATIONS → COMMIT → NEXT READY TASK
```
- Avoid uninterrupted planning. Ship small, verifiable vertical slices.
- Test changes and report actual commands/results. A GitHub document write is not a runtime test.
- Never tune on test outcomes, reuse held-out data as fresh, or silently alter outcome targets.
- Do not treat an internal grouped cross-validation as external validation.
- Never activate an experimental policy by default or couple it to physiological outputs without independent spec and approval.
- Retry root-cause-driven fixes; after three similar failures document blocker and switch to an independent ready task.
- Keep `tasks.md`, `progress.md`, `decisions.md`, `handoff.md` synchronized on every verified commit.
- Preserve prior PR #190 Product scope, history compatibility, experiments page, JS/Rust parity, no-LLM fallback.
- Do not merge, deploy, spend on paid APIs, publish restricted data or send external permission requests without authorization.
- If session ends, leave a precise handoff so a new session can resume; no assumption of background execution.

## Immediate implementation order
1. **BEH-001** reproducible Perea readiness loader/audit, no model fitting.
2. **BEH-002** baseline IID/persistence/Markov generators and grouped comparison harness, after freeze of outcome/split/metrics.
3. **BEH-003** semi-Markov candidate strictly research-only, if BEH-002 feasible.
4. **BEH-004** evaluation gates and reproducibility audit.
5. **BEH-005** LLM tool orchestration with deterministic fallback and strict authorization.
6. **BEH-006** optional research-only Product inspection; scientific status remains explicit.
7. **BEH-007** evaluate external-site data *only after explicit rights and eligibility clearance*.

Avoid substituting classifier training, an LLM roleplay simulation, or UI animations for behavior generation validation.
