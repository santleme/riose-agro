# Perea reserved-animal confirmatory protocol v1

**Status: frozen before reading outcomes for the four reserved animals.** This is an internal animal holdout from the same Perea source, not an external ranch or population validation.

## Frozen candidate identity

Run only the committed semi-Markov v1 candidate and the three committed simple baselines. The candidate and implementation artifacts are pinned:

| Artifact | SHA-256 |
| --- | --- |
| Sequence candidate implementation `scripts/science/behavior/perea_sequence_baselines.py` | `ba7fa908573a995d654d0442de80b4ebe5503bb0e0c5b63b5fb0be5a487c26b5` |
| Evaluator `scripts/science/behavior/evaluate_perea_sequence_baselines.py` | `0a2b984ee09c2d5f2a25ca028fbd1f237feb75b50d1a8f2945c6e15487a561b6` |
| Output schema `schemas/perea-behavior-sequence-v1.schema.json` | `f1aa87b6cd17153891beb0fb665321337eee8ffa671fc9a720bf622676484934` |
| Development evaluator `scripts/science/behavior/evaluate_perea_semimarkov_development.py` | `861010b9efb602c70514561cf911e4f293c4ed93fa8d9cf52236f3183b037113` |
| Confirmatory evaluator `scripts/science/behavior/evaluate_perea_confirmatory.py` | `464ff39e1145f0cff1b70be90c2db28324f84f4a71c9f51d6ab30a6b43e65196` |

Do not edit candidate, evaluator, seed schedule, metrics, threshold, or preprocessing after opening the holdout. A changed artifact invalidates this confirmatory run and requires a new frozen protocol and new eligible data.

## Partition and training

The only confirmatory test animals are `AH:2008`, `BH:5111`, `BR:8065`, and `RC:35`. Fit each candidate once on all 20 development animals, and only those animals. Do not refit on, select parameters from, or use any labels/features from the four confirmatory animals. Keep every animal's rows together. Split eligible rows into exact-minute windows under the frozen readiness policy.

Evaluate 20 independent deterministic generated replicates per observed confirmatory window. Use the identical v1 SHA-256 seed schedule with candidate name, confirmatory fold id `5`, animal ID, per-animal window index, and replicate. Only observed target window length is supplied to generation; no observed test labels or MI enter a candidate.

## Metrics and gate

Report each of the four animals separately and the equal-animal macro summary, per-class observed support, duration support, generated collapse/missing-class/switch diagnostics, and complete annotated-run metric with censored observations disclosed. Use the BEH-002/BEH-003 definitions exactly: composition macro MAE, supported-state row transition TV with distance 1.0 for a missing generated row, and secondary complete interior annotated-run median error. Include the same three preregistered threshold checks: composition within best simple baseline +0.01; transition TV at least 0.02 below both IID and persistence; each supported class composition error within +0.05 of best baseline.

Do not claim confidence intervals, broad population performance, site transfer, or external validity from four animals. Report a GO for *continued independent review only* if all thresholds pass; otherwise NO-GO for this candidate/source. Either outcome leaves the model `research_only`, disabled by default, and disconnected from FarmEngine.

## Reproducibility and resource record

Archive the exact deterministic JSON report with data, candidate, evaluator, schema and protocol hashes. Rerun it and require byte-identical JSON before accepting the result. Record wall time, Python/runtime version, host platform and peak RSS in a separate execution-metadata sidecar; those environment measurements are descriptive and are not model outputs or acceptance thresholds. Tests and this internal holdout do not establish biological truth.
