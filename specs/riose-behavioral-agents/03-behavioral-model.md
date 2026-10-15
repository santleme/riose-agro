# Behavioral generation model — architecture and boundaries

## Scientific question
Can a small, reproducible generator reproduce **time-ordered, observed activity sequences** of cattle in the same documented observation context, better than simple prespecified baselines? This is not a claim of animal decision-making cognition or an answer to how a change in nutrition affects weight gain.

## Candidate 0 — baselines
- Empirical global class frequency (IID draw) constrained to documented session length.
- First-order Markov transition chain with animal-grouped training only.
- State persistence / fixed-duration heuristic fitted on training sessions only.
- If timestamps permit, time-of-day baseline as separate candidate, otherwise **do not use time-of-day**.
Never let a candidate use future labels at prediction time.

## Candidate 1 — semi-Markov policy (research-only)
A seeded duration/transition sampler: one activity drawn from an explicit transition distribution conditioned on `previous_behavior` and **eligible known-at-inference covariates**; duration drawn from a fitted (possibly binned/nonparametric) state-duration model. Duration censored at recording gaps and session boundaries; no invented unobserved continuity.
Train and evaluate with animal-grouped splits. Refit on training folds only. Conditional features must exist at inference and have acceptable missingness and coverage. Use smoothing/backoff for unknown states.

## Ontology contract
`observed_behavior/perea-v2` = `WA` | `GR` | `RE` | `RU`.
`legacy_engine_action/v1` = `grazing` | `feeding` | `drinking` | `resting`.
Do not silently map RU to RE, WA to grazing, or inferred unobserved drinking to a Perea label.
A research-only behavior overlay can preserve independent annotations without mutating the engine's existing activity/cost/intake/weight computations. A future coupling spec must define conservation and consequences before any behavior changes physiology.

## Proposed versioned output
```json
{
  "type": "riose-behavior-sequence",
  "version": 1,
  "policy": {"id": "perea-semi-markov-experimental", "version": "0.1.0", "status": "research-only"},
  "source": {"dataset_id": "perea-v2", "sha256": null, "sampling_unit": "animal-minute"},
  "seed": 20261015,
  "animal_id": "synthetic-001",
  "time_unit": "minute",
  "events": [{"start": 0, "duration": 8, "behavior": "GR"}],
  "evidence_status": "unvalidated-generator"
}
```
Null checksum above denotes a **contract example only**; execution must reject missing real artifact checksums in persisted research runs.

## Policy interface
`initialize({policyArtifact, seed, scope, observationalContext})`
`sampleNext({animalId, previousBehavior, elapsed, knownContext}) -> {behavior, duration, ruleEvidence}`
`serialize() -> validated versioned event/observation artifact`
`explain(event) -> deterministic, auditable source/transition metadata`

Sample with distinct seeded streams per animal. Keep the generative process separate from classifiers and from the JS/Rust physics/metabolism kernel. Avoid LLM calls inside the per-minute/per-animal simulation loop. Define termination, bounds, mass conservation and no-infinite-loop guards.

## Future engine bridge (separate milestone)
- Versioned opt-in policy; disabled by default.
- Output is an experimental research overlay, not a replacement action in `FarmEngine`.
- Comparisons show observed cohort and experimental generated cohort with provenance.
- New domain coupling to water, grazing depletion, energy and productivity requires explicit scientific models and independent tests; not in initial scope.
