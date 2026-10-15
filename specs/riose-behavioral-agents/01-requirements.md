# Requirements and acceptance — Behavioral Agents

## Scientific requirements
- **SCI-BEH-001 — Dataset eligibility:** Record original URI/DOI, observed target, population/age/breed, experiment/ranch identifiers, licensing, raw checksums, missingness, duplicated animal-minute keys, time coverage, annotation policy, right censoring and available sensor features. Fail closed on data-rights ambiguity.
- **SCI-BEH-002 — Distinct tasks:** A behavior recognizer predicts an observation label given sensor inputs; a generator predicts transitions/durations given simulated available context. Report separate estimands, features, train/test splits and evidence.
- **SCI-BEH-003 — Label ontology:** Preserve Perea WA/GR/RE/RU and current engine actions independently. Any adapter requires an explicit compatibility mapping and a documented 'unmapped' path. In particular, Perea does not observe drinking/feeding in the current engine ontology.
- **SCI-BEH-004 — No leakage:** All records of an animal stay in one fold; no feature/scaler/threshold/hyperparameter may be selected on held-out animal data. Time ordering must be respected, timestamps/gaps normalized and a previously consulted dataset may not be presented as a fresh external test.
- **SCI-BEH-005 — Generative calibration vs evaluation:** Candidate generator must be compared with same-data empirical baselines on animal-held-out sequences, using a frozen protocol and clearly separated internal development, confirmatory evaluation and external validation.
- **SCI-BEH-006 — Scientific abstention:** The model must report unsupported or unmeasured environmental contexts rather than extrapolating silently; no causal effects of supplementation, heat or forage supply without intervention outcome data.
- **SCI-BEH-007 — Reproducibility:** Model version, policy hash, dataset hash, seed, evaluation fixtures and full numeric diagnostics captured. No confidential raw redistribution.
- **SCI-BEH-008 — Default safety:** The policy remains opt-in, disabled by default, until scientific and engineering promotion gates pass. All existing FarmEngine behavior and Product V2 outputs remain stable.

## Engineering requirements
- **ENG-BEH-001:** Develop a standalone evaluation pipeline in Python, avoiding Product/network coupling.
- **ENG-BEH-002:** Define explicit policy interface and state: `current_behavior`, `elapsed_in_state`, `clock` if supported by observations, `animal_id`, `seed`, `policy_id/version`, and optional observed covariates. Unsupported features cannot be fabricated.
- **ENG-BEH-003:** Deterministic replay: same inputs, model artifact and seed return the same event sequence; independent animal RNG streams avoid changed outputs when iterating over other animals.
- **ENG-BEH-004:** Match generated and observed time resolution, terminal censoring and sampling windows; keep metric denominators explicit.
- **ENG-BEH-005:** If an engine adapter is built, it must be isolated behind opt-in feature capability and never alter default metabolism, feeding, water/thirst rules or persisted contracts.
- **ENG-BEH-006:** Tool-based LLM assistant can retrieve **approved** evidence summaries, inspect eligible model metadata, draft a valid experiment plan and request execution only after validation and explicit user confirmation; keys server side; no generated scientific values.
- **ENG-BEH-007:** Incremental checks: focused tests, scientific holdout tests, JS/Rust parity where affected, E2E where UI affected, and browser inspection for accessible minimal UI.

## Product requirements
- **PROD-BEH-001:** Preserve Apple-like Riose style: quiet white/off-white workspace, compact scientific typography, restrained motion, accessible focus and reduced-motion support.
- **PROD-BEH-002:** Present behavior provenance: 'observed', 'classified', 'generated — experimental', or 'legacy demonstration'. Do not represent generated traces as observed or claim validated predictions.
- **PROD-BEH-003:** Expose inspectable transitions/durations and population distributions, side by side with the correct observed cohort only when legally and scientifically appropriate.
- **PROD-BEH-004:** Absent eligible evidence, show limitations and remain on legacy behavior; never silently switch to an 'intelligent agents' mode.

## Promotion decision
Promotion is **NO-GO** by default. An experimental policy may be integrated opt-in only after reproducible internal evaluation beats agreed simple baselines on predefined metrics without important class failures, with explicit scope/limitations. Any claim of generalizable pasture behavior or intervention response requires an independent authorized data source with suitable ground truth, pre-registered evaluation and review.
