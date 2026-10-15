# Semi-Markov candidate protocol v1

**Status: frozen before implementing or scoring this candidate.** This is an additional candidate under the BEH-002 development partition and metric protocol. It does not change the reserved confirmatory set or authorize model promotion.

## Training inputs and duration support

For each training animal, split canonical eligible WA/GR/RE/RU labels into exact-minute windows. Extract maximal label runs within each window. First and last runs in every window are censored and excluded from duration samples; no run can bridge a timestamp gap or a contradictory-label exclusion. A class is duration-supported only if at least one complete training run exists. Preserve the raw minute integer duration from the annotation; do not fit parametric distributions or infer sub-minute timing.

For each supported class, sample duration by choosing uniformly from training animals with at least one complete run of that class, then uniformly from that animal's complete runs. This prevents animals with more coverage from dominating duration samples. Initial state uses the training-derived equal-animal class-minute prior renormalized over duration-supported states. If no class has a complete run, fail closed with `unsupported_duration_support`; do not invent a duration.

## Transitions and generation

Learn state changes between successive annotated runs within each contiguous training window. For each source state, normalize each training animal's outgoing run-transition counts before averaging those animal rows equally, then add symmetric 0.5 pseudocounts and normalize. If the current state has no observed outgoing run transition, use the duration-supported initial-state prior. Generate by sampling the initial state, its observed class-specific duration, then the next state and its duration until reaching the requested window length; truncate only the final generated run to match that length. Return one class label per minute. Use the BEH-002 deterministic seed derivation with candidate name `semimarkov`.

No covariate conditioning is implemented: the source does not provide an available future sensor/physiology input for generation. No motion index, timestamp, test label, future animal behavior, energy, thirst, weight, DMI, or engine action enters candidate fitting or generation. If duration-support filtering removes a class, report that class as unsupported and report the retained prior support.

## Evaluation and gate

Evaluate only the five BEH-002 development folds using the same 20 replicas, target observed lengths, animal-macro composition error, supported transition TV, complete observed-run diagnostic, and generated collapse diagnostics. Compare against archived IID, persistence and Markov outputs without changing those baseline artifacts. Tests must show deterministic seeded sequences, exact output length, ontology validity, fail-closed no-duration behavior, boundary-censoring exclusion, training/test animal disjointness, and no transition across gaps.

The candidate passes only if all frozen BEH-002 thresholds hold: composition MAE no more than the best simple baseline +0.01, transition TV at least 0.02 lower than both IID and persistence, and no supported class composition error more than 0.05 worse than the best simple baseline. Otherwise record NO-GO for this candidate on Perea development and keep the confirmatory four-animal holdout unopened. This result cannot authorize production integration or infer biological validity.

**Class-wise gate definition:** for each class and animal-window, calculate the absolute difference between observed class proportion and the mean generated class proportion across the 20 replicas. Average windows within each animal, then animals equally. Compare each class value for semi-Markov against the smallest corresponding value among IID, persistence, and Markov. A class is supported when its observed development windows contain at least one eligible minute and the training fold has at least one eligible minute for it. Freeze this definition before semi-Markov development scoring.
