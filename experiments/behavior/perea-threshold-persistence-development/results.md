# Perea threshold and auto-fed persistence development diagnostic

**Post-hoc development diagnostic only.** The thresholds and persistence rule were designed after inspection of the frozen baseline. These nested OOF scores are not independent validation, are not a new ranch test, and do not validate the Riose engine.

Source DOI: `10.6084/m9.figshare.28801181.v2`; license `CC BY 4.0`; MD5 `7cd143e8cccc79a5e159eaa83428529f`.

## Frozen scope and rule

The experiment uses the same 5,582 temporally complete rows and frozen six outer animal folds as the earlier nested run. The primary metric is equal-animal mean per-animal F1 for RE and RU. A one-dimensional ordered rule with two cutpoints can represent only three intervals, so this two-cut rule uses two causal MI-derived inputs: current MI level and absolute one-minute change.

The four quadrants map low level/low change to RE, low level/high change to RU, high level/low change to GR, and high level/high change to WA. Each outer training set selects cutpoints on stitched OOF predictions from five inner animal-group folds. The persistence variant gets its own inner-selected pair, seeds with the instantaneous rule at each animal-window start, and switches after two consecutive differing rule suggestions. It carries only its own prior predictions and resets at timestamp gaps; it never uses observed prior labels.

## Same-row outer OOF results

| Model | Primary equal-animal RE/RU F1 | Equal-animal RE recall | Equal-animal RU recall | Equal-animal macro-F1 | Record accuracy |
|---|---:|---:|---:|---:|---:|
| Outer-training majority | 0.000 | 0.000 | 0.000 | 0.159 | 0.485 |
| Two-threshold MI rule | 0.392 | 0.563 | 0.239 | 0.353 | 0.361 |
| Auto-fed persistence (2 confirmations) | 0.364 | 0.510 | 0.252 | 0.305 | 0.298 |

### Cutpoints selected per outer fold

| Fold | Raw rule: MI level | Raw rule: |ΔMI| | Persistence: MI level | Persistence: |ΔMI| |
|---:|---:|---:|---:|---:|
| 0 | 6.5 | 1.5 | 6.5 | 1.5 |
| 1 | 6.5 | 2.5 | 6.5 | 2.5 |
| 2 | 6.5 | 1.5 | 6.5 | 1.5 |
| 3 | 6.5 | 2.5 | 5.5 | 1.5 |
| 4 | 6.5 | 1.5 | 6.5 | 1.5 |
| 5 | 6.5 | 2.5 | 7.5 | 2.5 |

## Limits and interpretation

The static majority baseline is intentionally simple. The threshold rule tests whether a tiny MI-derived rule can serve as a transparent baseline; the persistence variant tests a causal predicted-state smoother, not the source's gold-label carry-forward. The raw threshold rule has primary RE/RU F1 0.392, close to the earlier selected-model reference 0.403, but record accuracy is only 0.361 versus 0.814 for that reference. This is a pronounced class tradeoff, not a general improvement. The design was created after viewing earlier Perea errors, so the nested outer estimates must not be described as confirmatory or independent. A fresh dataset with compatible video labels and animal identity is still required for external validation.

The machine-readable JSON includes all per-animal scores, outer-fold results, and selected thresholds; the corresponding OOF predictions are in a separate CSV. Reproduce with:

```bash
uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python experiments/behavior/perea-threshold-persistence-development/evaluate_perea_threshold_persistence.py
```
