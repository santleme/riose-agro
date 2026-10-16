# Perea semi-Markov development result v1

Generated under [`08-semimarkov-protocol-v1.md`](../../specs/riose-behavioral-agents/08-semimarkov-protocol-v1.md). The machine-readable report records the exact source/protocol/implementation hashes, five animal-grouped folds, per-animal metrics, and duration support by training fold in [`perea-semimarkov-development-v1.json`](perea-semimarkov-development-v1.json).

## Frozen development comparison

| Candidate | Animal-macro composition MAE | Animal-macro transition TV | Complete annotated-run median absolute error (min) |
| --- | ---: | ---: | ---: |
| IID | 0.3532 | 0.8178 | 3.52 |
| Persistence | 0.3676 | 0.7544 | unavailable (no interior generated runs) |
| First-order Markov | 0.3600 | 0.7528 | 3.57 |
| Semi-Markov | 0.3610 | 0.7028 | 4.03 |

Semi-Markov passes the frozen *development eligibility* criteria: composition is within 0.01 of the best baseline; transition TV is at least 0.02 below IID and persistence; each supported class's composition error is within 0.05 of the best baseline. All four classes have complete duration support in each training fold.

This permits a separately reviewed confirmatory comparison after candidate code and this evidence are committed. It does **not** establish behavioral validity or authorize production use. The four confirmatory animals are not scored in this artifact. No FarmEngine coupling or default change occurred.

## Limits

Scores are within-source Perea diagnostics over 20 development animals from two ranch contexts. The holdout is a small internal animal holdout, not external ranch validation. Source labels may carry forward behaviors shorter than 30 seconds; duration metrics concern annotated label runs, not unbiased biological bouts. No physiology, intake, weight, uncertainty interval, or commercial validity is inferred. Candidate remains research-only.
