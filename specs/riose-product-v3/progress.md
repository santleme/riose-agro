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
