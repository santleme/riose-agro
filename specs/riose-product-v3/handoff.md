# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: `80bdc69` (`feat: add deterministic scenario prompt drafting`).
Current branch: `codex/behavioral-agents-sdd`; earlier behavioral/Product V3 commits remain local and unpushed under the network policy.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest/replay; P3-003 Worker/UI; P3-004 isolated BR-CORTE calculator; P3-005 cancellation; P3-006 browser performance and JS/Rust/WASM parity evidence; P3-009 deterministic prompt-to-review.
Task in progress: none currently eligible; P3-007 and P3-008 remain blocked by their documented gates.
Files changed: P3-009 deterministic parser, Product V3 prompt UI and execution status, tests, E2E flow and screenshots; prior benchmark/resource evidence remains under docs/evidence.
Tests executed: `npm run test:scenario-lab-intent` (4/4); `npm run test:e2e:scenario-lab` (pass including clarification, review-only drafting, explicit run, cancellation and mobile width); `npm run test:e2e:product` (pass); `npm test` (486/486); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints / 31 daily rows); `git diff --check`.
Passing checks: prompt drafts only supported explicit fields, missing fields request clarification, unsupported requests fail closed, and no Worker runs until user confirmation. Product V2 flow and JS/Rust trajectory parity remain unchanged.
Known failures: none in verified scopes. Resource estimate is a linear planning proxy, not an actual transfer or total browser memory guarantee. Native WASM benchmark is a 24-hour single-scenario path and does not establish scenario-set parity.
Scientific limitations: FarmEngine stays illustrative. BR-CORTE is a published conditional total-DMI equation requiring supplied ADG, limited to growing Zebu on supplemented tropical pasture and published ranges; totals assume representative fixed inputs. This does not establish Riose independent calibration or paid-customer decision validity.
Visual limitations: initial and calculated-result desktop screenshots retained; 390px width passes; assistive-technology and broader browser matrix remain.
Next action: commit the verified P3-009 prompt-to-review slice. No unblocked P3 task remains; scope any follow-on product task separately from the spend-gated provider integration and independent scientific review. Keep behavior research NO-GO separate from Product V3.
Blocked dependencies: P3-007 AI orchestration remains blocked by shared provider spend controls; P3-008 commercial quantitative feature remains blocked pending independent domain review; behavior model integration remains NO-GO and independent of Product V3.
