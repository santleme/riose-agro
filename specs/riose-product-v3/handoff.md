# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: `75c9ed0` (`feat: ship multi-scenario Product V3 lab`); P3-004 changes are verified locally and awaiting their responsibility-scoped commit.
Current branch: `codex/behavioral-agents-sdd`; earlier behavioral/Product V3 commits remain local and unpushed under the network policy.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest/replay; P3-003 Worker/UI; P3-004 isolated BR-CORTE calculator; P3-005 cancellation.
Task in progress: P3-006 browser performance and native parity evidence.
Files changed: BR-CORTE scenario adapter and tests; Product V3 page/styles/app, server allowlist, browser E2E and screenshots; persisted BR-CORTE reference run; package script; SDD tasks/progress/handoff.
Tests executed: `npm run test:br-corte-scenarios` (3/3); `node --test tests/app.test.js` (1/1); `npm run test:e2e:scenario-lab` (pass); `npm run test:e2e:product` (pass); `npm test` (477/477); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints/31 daily rows).
Passing checks: published Table 2.14 vector; input/domain/cost/assumption validation; optional cost omission; export/reopen/recalculate; FarmEngine multi-arm comparison and cancellation; 390px mobile viewport, no browser console errors; Product V2 flow and JS/Rust parity.
Known failures: none in verified scopes. Repeatable 100/1,000/10,000 population timing, memory and transfer measurements remain outstanding.
Scientific limitations: FarmEngine stays illustrative. BR-CORTE is a published conditional total-DMI equation requiring supplied ADG, limited to growing Zebu on supplemented tropical pasture and published ranges; totals assume representative fixed inputs. This does not establish Riose independent calibration or paid-customer decision validity.
Visual limitations: initial and calculated-result desktop screenshots retained; 390px width passes; assistive-technology and broader browser matrix remain.
Next action: begin P3-006 by inspecting existing benchmark/native replay harnesses, then establish a repeatable population workload and capture timings/payload without asserting a target before measurement.
Blocked dependencies: P3-007 AI orchestration remains blocked by shared provider spend controls; P3-008 commercial quantitative feature remains blocked pending independent domain review; behavior model integration remains NO-GO and independent of Product V3.
