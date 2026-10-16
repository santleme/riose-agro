# Behavioral-agent risks — post-NO-GO register

Updated 2026-10-15. Ratings are qualitative engineering/scientific planning, not calibrated probabilities.

| ID | Risk | Evidence / impact | Gate and mitigation | Status |
|---|---|---|---|---|
| RSK-BEH-001 | Failed candidate is tuned against the opened Perea confirmatory animals | Three preregistered gates failed; any outcome-guided tuning would invalidate the holdout | Freeze candidate, evaluator, thresholds and reports. New model requires a new eligible protocol/data; do not recycle these animals as confirmation | ACTIVE / controlled |
| RSK-BEH-002 | Annotation runs are mistaken for biological episode durations | 68.5–98.9% of source runs by class touch a coverage-window boundary; labels may carry forward sub-30-second events | Mark complete/censored runs and annotation stage; no daily budget or biology claim from current files | ACTIVE |
| RSK-BEH-003 | Sparse RU support produces unstable rare-state behavior | Only two complete RU training durations; RU composition gate failed; generated outputs have more local single-class windows than IID/Markov for equal 2–15 minute lengths | Report class support and abstain from promotion; use a separately justified dataset and class-wise protocol | ACTIVE |
| RSK-BEH-004 | Short-window distribution is overread as generator collapse or biological implausibility | 85/226 confirmatory target windows contain one minute; only 15 exceed 15 minutes | Stratify by target length and compare matched baselines; call this local undercoverage, not biological collapse | ACTIVE / documented |
| RSK-BEH-005 | Daypart effects are confounded with observation schedule | Zero complete 24-hour windows; source uses sampled time intervals, local Mountain timestamps without offset/fold | Do not choose a circadian/daypart candidate from Perea; require continuous/context-rich eligible observations | ACTIVE |
| RSK-BEH-006 | Unclear reuse terms are mistaken for commercial training permission | Tabapuã microdata are request-only; open article terms do not grant microdata rights; other sources include absent/conflicting licenses | No contact/data import without authorization; require explicit commercial, derivative and retention terms before any pipeline access | ACTIVE |
| RSK-BEH-007 | Public metadata is treated as inspected data | USDA Richmond archive returned 403; CC0 catalog metadata alone does not verify columns, archive terms or continuous label support | Obtain from an authorized route, checksum, inspect and re-audit before marking eligible | ACTIVE |
| RSK-BEH-008 | Optional provider model/schema drift or paid usage | Official Groq/HF request shapes are compatible today; model availability/provider routing and cost change; current code bounds input/output/time and per-IP request rate but has no shared hard monetary budget | Keep keys server-only, providers disabled by default, fall back locally, mock tests only; require a shared persistent budget/cost gate before production enabling | ACTIVE |
| RSK-BEH-009 | Component schemas are interpreted as biological validation | JSON Schema/unit/provenance tests check interface consistency only | Keep implementation status separate from evidence status; require scientific validation independent from software tests | ACTIVE |
| RSK-BEH-010 | Behavior sequence is coupled to physiology/intervention without support | No Perea outcome/counterfactual data estimates DMI, ADG, weight, supplementation, climate or forage effects | Separate versioned components; unsupported effects must be null; default FarmEngine stays unchanged | ACTIVE |

## Session gate

There is no selected next generator. BEH-013 waits for rights/data access; BEH-014 waits for suitable independent sequences and a new frozen evaluation design; BEH-015 waits for independent validation and outcome-specific evidence. BEH-006 remains blocked by the NO-GO.
