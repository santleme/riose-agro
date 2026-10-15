# Testing strategy

- Contract seam: create/validate/replay scenario sets; reject unsupported versions, fields, scenario counts, duplicate IDs/values, multiple factors, invalid engine inputs. Verify same snapshot/seed and deterministic replay.
- Scientific seam: published BR-CORTE worked/boundary vectors; domain limits; supplied ADG semantics; per-head versus herd scaling and explicit-cost arithmetic; no accidental FarmEngine coupling.
- Worker seam: progress by arm, cancellation, no partial history, recovery and rerun.
- Product seam: browser review-before-run, 3+ chart traces, sensitivity adjustment, cancellation, history/replay/export and mobile/a11y.
- Intent integrity seam: PT/EN unit and ambiguity matrix; validate intent-to-manifest consistency; assert reviewed digest equals Worker-computed digest and returned result identity/config; edits revoke review without Worker dispatch.
- Archive seam: versioned archive hash/provenance validation, unsupported/tampered byte rejection, legacy `{manifest,results}` reading, and explicit recalc compared against the full canonically serialized stored result.
- Accessibility states: test live review/running/cancelled/error/completed messages, keyboard movement/selection, mobile width, and `prefers-reduced-motion` styles.
- Regression: `npm test`, `npm run test:parity`, `npm run test:e2e:product`; preserve historic scenario formats.
- Performance: benchmark 100, 1,000, 10,000 animals, 3+ arms, documented runtime/memory/payload and interaction latency on named browser/device.
- Scientific gate: capture source/model provenance, domain, output units, validation protocol and limitation text. Software pass is not biological validation.
