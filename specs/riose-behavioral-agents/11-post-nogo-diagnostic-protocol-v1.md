# Post-NO-GO diagnostic replay protocol v1

**Status: frozen before diagnostic replay.** This is descriptive investigation of the already inspected four-animal Perea confirmatory set. It is not a new evaluation, model-selection procedure, threshold adjustment, or source of a new GO.

## Fixed inputs and boundaries

- Read the existing frozen result `docs/evidence/perea-confirmatory-v1.json`, source CSV and canonical readiness report.
- Reuse the exact candidate, baseline implementations, held-out animal roster, train-only fitting, 20 replicates per window, and SHA-256 seed schedule pinned by `09-confirmatory-protocol-v1.md`.
- Fit only on the same 20 development animals. The four confirmatory animals are used only to reproduce sequence summaries already permitted by the confirmatory protocol.
- Do not change the candidate, parameters, metrics, thresholds, preprocessing, animal roster, or choose a model from these diagnostics. Do not infer confidence intervals or population effects from generated replicates.

## Descriptive outputs

1. Reconcile the three frozen gate calculations and report their numeric margins from the pre-existing result JSON.
2. Replay IID, persistence, Markov and semi-Markov sequences under the original seeds. Report pooled generated class proportions, single-class replicate-window rate, absent class occurrences per replicate-window, and switches per minute; cross-check the last two against the frozen evaluator artifact.
3. Summarize complete interior annotated-run durations for observed confirmatory windows and generated windows by class using count, median and empirical quartiles. Treat generated replicates as synthetic output, not independent animals.
4. Count left/right censored observed annotated runs from the existing time-series readiness artifact. Do not reinterpret labels as unbiased biological bout durations; preserve the sub-30-second carry-forward and sampled-window limitations.
5. Report per-animal frozen composition and transition metrics and descriptive ranges. Four animals do not support a stable estimate of between-animal variance.

## Interpretation constraints

- A generated class omission or one-class window is a sequence-coverage diagnostic, not a biological pathology diagnosis.
- Duration summaries are conditional on operational exact-minute windows and internal runs. Boundary runs are censored; source annotation runs may also be distorted by carry-forward.
- A post-hoc discrepancy is a hypothesis for future data/protocol design only. It cannot be used to retune or reselect the failed semi-Markov model.
- The report must state both supported findings and unknowns, including the lack of independent-site data, 24-hour coverage, event-level annotation timing, and direct physiological/intervention outcomes.
