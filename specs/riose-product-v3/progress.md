# Progress

## 2026-10-15 — Product V3 SDD begins

- User direction recorded: develop a practical scenario laboratory independently from Behavioral Research; preserve the semi-Markov NO-GO.
- Reused the existing Product V2 SDD rather than duplicating its detailed visual design, accessibility and browser conventions.
- Audit found Product V2 supports a single paired comparison and deterministic timeline/history; `analyzeSensitivity` exists for one supported factor but is not exposed as the V3 sensitivity workflow. No run cancellation is exposed. P2-007 native population parity and P2-008 browser performance are still backlog.
- BR-CORTE Eq. 2.6 exists and reproduces its official worked example. Domain is growing Zebu cattle on supplemented tropical pasture; GMD is an input. It is a separate model and is not coupled to FarmEngine.
- Added V3 spec bundle and selected P3-002 as the next vertical slice: versioned 3+ scenario manifest seam before Worker/UI integration.
- P3-002 implemented `riose-scenario-set/v1` create/validate/replay functions. A set has one baseline and 2–9 intervention arms, varies a single common FarmEngine factor, binds all arms to the same snapshot/seed/version, and reports aligned scenario rows/checkpoints with `validated:false`. All arms are replayed deterministically using the existing population runner; the response shares the baseline projection rather than copying it into every arm.
- TDD evidence: initial public contract import failed because the module did not exist; then the behavior tests pass. `npm run test:scenario-set` passed 8/8; `node --test tests/scenario-contract.test.js tests/scenario-goldens.test.js` passed 11/11. Full `npm test` passed 473/473, and `npm run test:parity` passed the 24-checkpoint baseline-pasture and 1,440-hour housing trajectory contracts. Generated reports/artifacts were restored after both suites.
- No FarmEngine default, research NO-GO, old contract, or commercial-use gate changed.

## 2026-10-15 — P3-003 multi-arm scenario lab

- Added the `replayScenarioSet` Worker command/response and bounded progress identity. Worker validates the protocol envelope and uses the V3 manifest validator before executing; actual executor is labeled `javascript-scenario-set`.
- Added `/scenario-lab.html` as a separate Product V3 route, linked from Product. User configures animal count, days, shared weather, seed, baseline supplement and 2–9 alternatives; the review step precedes execution.
- Results are real Worker outputs: named mean-weight traces, shared checkpoint slider, selectable per-animal population grid, selected-animal details, daily table, units, engine assumptions, executor/model limits and explicit illustrative labels. One-factor deterministic sensitivity is displayed as scenario traces, not uncertainty.
- Export writes the complete manifest and result; importing that file revalidates the manifest and reruns every scenario with the same seed/snapshot. Cancellation terminates the dedicated Worker, clears no completed result, keeps review state available, and creates no partial result.
- Browser E2E covers review, 3-arm run, data traces, Day 1 selection, animal inspection, export/import/replay, cancellation of a 10,000-animal/365-day run, mobile no-overflow, and no console errors. Screenshots: `docs/evidence/product-v3-scenario-lab-initial.png`, `docs/evidence/product-v3-scenario-lab-results.png`.
- Verification: focused app/protocol/scenario tests 15/15; `npm run test:e2e:scenario-lab` pass; existing `npm run test:e2e:product` pass; full `npm test` 474/474. Generated legacy reports and V2 screenshots from the test runs were restored.
- P3-003 and P3-005 are DONE. P3-004 remains the next READY task. Browser measurement for 100/1,000/10,000 populations and 3+ arms is still not done; no performance claim is made.
