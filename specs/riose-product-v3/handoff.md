# Product V3 session handoff

Date: 2026-10-15
Branch: `codex/behavioral-agents-sdd` (local commits from earlier Behavioral SDD remain unpushed; do not rewrite/push around network policy).
Last verified commit: `2f71740` (`feat: add bounded BR-CORTE scenario calculator`).
Current branch: `codex/behavioral-agents-sdd`; earlier behavioral/Product V3 commits remain local and unpushed under the network policy.
Completed tasks: P3-001 audit/rescope; P3-002 multi-scenario manifest/replay; P3-003 Worker/UI; P3-004 isolated BR-CORTE calculator; P3-005 cancellation.
Task in progress: P3-006 browser performance and native parity evidence.
Files changed: Product V3 browser population benchmark candidate and package script; SDD task/progress/decision/risk/handoff records. P3-004 implementation is committed at `2f71740`.
Tests executed: `npm run test:br-corte-scenarios` (3/3); `node --test tests/app.test.js` (1/1); `npm run test:e2e:scenario-lab` (pass); `npm run test:e2e:product` (pass); `npm test` (477/477); `npm run test:parity` (baseline 24 checkpoints; housing 1,440 hourly checkpoints/31 daily rows).
Passing checks: published Table 2.14 vector; input/domain/cost/assumption validation; optional cost omission; export/reopen/recalculate; FarmEngine multi-arm comparison and cancellation; 390px mobile viewport, no browser console errors; Product V2 flow and JS/Rust parity.
Known failures: none in verified scopes. Benchmark smoke passes at 100/1,000/10,000, but the candidate has only single samples, dirty-source metadata, and needs a clean repeated run before evidence use.
Scientific limitations: FarmEngine stays illustrative. BR-CORTE is a published conditional total-DMI equation requiring supplied ADG, limited to growing Zebu on supplemented tropical pasture and published ranges; totals assume representative fixed inputs. This does not establish Riose independent calibration or paid-customer decision validity.
Visual limitations: initial and calculated-result desktop screenshots retained; 390px width passes; assistive-technology and broader browser matrix remain.
Next action: verify and commit the repeatable browser benchmark harness, then run one warmup and three repetitions per 100/1,000/10,000 population on a clean source revision; separately run the existing browser WASM golden/parity benchmark and persist the report.
Blocked dependencies: P3-007 AI orchestration remains blocked by shared provider spend controls; P3-008 commercial quantitative feature remains blocked pending independent domain review; behavior model integration remains NO-GO and independent of Product V3.
