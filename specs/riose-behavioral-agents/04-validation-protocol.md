# Preregistered-style evaluation specification — v0.1

**Status:** protocol draft frozen as initial SDD guidance before new generative training. A true preregistration must finalize metric definitions, candidate search and partitions in a committed artifact before reading held-out generation outcomes. Historical Perea classifications have already been inspected and cannot be relabeled as prospective confirmation.

## Estimands
1. **Activity composition:** proportion of *observed eligible minutes* in each WA/GR/RE/RU class, evaluated per held-out animal/session.
2. **Transitions:** conditional distribution of next activity given current, using only observed contiguous minutes; count full transitions and denominators.
3. **Bout duration:** complete contiguous runs per class, censored at session ends or time gaps; do not treat incomplete bouts as fully observed.
4. **Temporal structure:** lagged autocorrelation and transition persistence at preregistered lags if enough contiguous data exist.
5. **Between-animal variation:** empirical dispersion across animal-held-out activity proportions and bout summaries.
6. **Clock/hour effects:** only if coverage report proves sufficient aligned clock observations, otherwise mark unavailable.

## Protocol design
- Perea preprocessing must reproduce the repository's duplicate/conflicting-label policy without using held-out outcomes for feature engineering.
- Group all records belonging to one `Breed:ID` in a single fold. Explicitly record ranch-breed confounding; no site-transfer claim.
- Cross-validation for exploratory development; nested grouped train/validation to choose hyperparameters. Keep final held-out animal folds untouched during fitting and candidate selection.
- Each evaluation run compares IID, persistence, Markov and semi-Markov candidates under identical observable session windows and seeds.
- Generate many independent seeded replicates per held-out animal session. Replicate simulation randomness is not biological sample size: calculate animal-cluster summaries, never present synthetic repetitions as independent field observations.
- Never feed held-out observed future motion index or future behavior labels into a generator. If evaluating one-step forecast with known past behavior, label this a distinct teacher-forced metric.
- Freeze candidate families, smoothing, time-of-day eligibility, evaluation definitions and stop conditions before inspecting held-out generative scores.
- Keep *internal grouped evaluation*, *external dataset stress tests* and *commercial-scoped validations* separately labeled.

## Reported metrics
- Per-class absolute composition error; macro and per-animal averages.
- Jensen–Shannon divergence on smoothed empirical class distributions (define smoothing and log base before run).
- Transition-matrix total variation error, conditioned only on states with documented minimum support.
- Earth-mover/Wasserstein distance or absolute quantile errors for fully observed state bout lengths; report censoring counts and class support.
- Calibration-like diagnostics for predicted transition probabilities when data support them; these are not whole-sequence predictive intervals.
- Generator diversity and collapse checks: fraction of sequences with one class only, missing states and excessive state switching.
- Performance and replay identity at 100, 1,000 and 10,000 synthetic agents when available.

## Gating decisions
- **Gate A: data eligible** only when timestamp quality, metadata, annotation effects and rights are documented. Stop if session length cannot support claimed metric.
- **Gate B: benchmark reproducible** only when preprocessing, grouped splits, metric scripts and fixed random seeds have tests and archive hashes.
- **Gate C: comparative development** only if candidate exceeds simple prespecified baselines on primary metrics without catastrophic regression in rare classes; effect threshold and tie-break order must be registered BEFORE evaluation.
- **Gate D: integration opt-in** only if performance, deterministic repeatability, bounded state and provenance are verified. This does not change science status.
- **Gate E: domain validity/production** remains **NO-GO** until independent authorized external pasture data, matching population/ontology and outcome, are evaluated with frozen procedures. An internal F1 or within-Perea sequence score never passes Gate E.

Produce machine-readable metric artifacts, per-animal summaries, visual diagnostics and negative findings. Do not invent 'confidence scores' for simulated cattle decisions.
