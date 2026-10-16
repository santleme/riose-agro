# Perea semi-Markov confirmatory result — NO-GO

The internal animal holdout was evaluated under the frozen [`09-confirmatory-protocol-v1.md`](../../specs/riose-behavioral-agents/09-confirmatory-protocol-v1.md). Full per-animal metrics, data/model/evaluator/schema hashes, coverage, and gate checks are in [`perea-confirmatory-v1.json`](perea-confirmatory-v1.json). Runtime and peak RSS are in [`perea-confirmatory-execution-metadata.json`](perea-confirmatory-execution-metadata.json).

## Partition and support

- Training used only the 20 development animals (1,079 observed contiguous windows).
- Confirmation used only the four frozen animals (AH:2008, BH:5111, BR:8065, RC:35), comprising 226 windows and 1,349 eligible annotated minutes.
- All four classes occurred in confirmation. Training duration support existed for all four, but RU had only two complete runs across the 20 training animals.
- Twenty deterministic generated replicates were evaluated per confirmatory window. No test label or motion index entered generation.

## Gate metrics

| Candidate | Animal-macro composition MAE | Animal-macro transition TV |
| --- | ---: | ---: |
| IID | 0.3609 | 0.8184 |
| Persistence | 0.3705 | 0.7125 |
| First-order Markov | 0.3694 | 0.7640 |
| Semi-Markov | 0.3711 | 0.7075 |

Semi-Markov failed the frozen thresholds:

- Composition error exceeded the best simple baseline plus 0.01 by 0.000224.
- Transition TV improved over persistence by only 0.005009, below the required 0.02.
- RU composition error was 0.3102 versus the best baseline 0.2455; this exceeds the per-class +0.05 limit.

Decision: **NO-GO for this candidate on this Perea source**. Do not adjust the candidate based on these confirmatory outcomes. The result does not say that behavior generation is generally invalid.

## Execution and limits

The deterministic result JSON reproduced byte-for-byte on a second run (SHA-256 `499d7d0c0952428c9f305bab7c73123f70770f20599d9f779a645739bb23a94f`). The recorded run took about 0.41 s with peak RSS about 29.7 MB on Python 3.12.3 under WSL2; resource numbers are descriptive, not scientific acceptance metrics.

This is a four-animal internal holdout from the same two-ranch source, not independent-site validation. Labels may carry forward sub-30-second events. No confidence intervals, physiology, DMI, ADG, weight effects, or FarmEngine behavior is inferred. The semi-Markov candidate remains research-only, disabled, and disconnected from the default engine.
