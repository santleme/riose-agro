# Acceptance criteria

| ID | Criterion | Evidence |
|---|---|---|
| P4-ACC-001 | Reuse existing V3 multi-arm comparison and binary historical compatibility without contract regression. | V3 E2E, scenario-set tests, archive tests |
| P4-ACC-002 | BR-CORTE sensitivity sweep uses only registered Eq. 2.6 inputs inside source-declared ranges, with fixed BW/ADG and step/point checks. | Contract/unit tests and source worked-vector test |
| P4-ACC-003 | Review precedes explicit calculation; no form edit runs automatically. | Browser E2E |
| P4-ACC-004 | UI shows actual computed values, units, model source/status and deterministic/noncausal limitation. | Browser E2E + visual capture |
| P4-ACC-005 | Conditional cost requires user price/currency and uses supplement DM amount, count, duration only. | Existing plus sensitivity cost tests |
| P4-ACC-006 | Empty state distinguishes absent user inputs from an explicitly loaded example. | Browser E2E/accessibility review |
| P4-ACC-007 | V2/V3, 497 baseline suite, parity as applicable, Perea NO-GO and provider/science gates remain unchanged. | Regression output and status records |
| P4-ACC-008 | Product discovery materials are prepared without fabricating user feedback or contacting participants. | Demonstration script, question guide and blank structured record |
