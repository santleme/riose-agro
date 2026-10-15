# Perea post-NO-GO diagnostic replay v1

**Decision remains NO-GO.** This artifact is a fixed-seed descriptive replay; it does not revise the candidate, thresholds, or original confirmatory result.

Source SHA-256: `b4d6e14d6ff029dbf497287a774aaa27ec471e7ed1ef5884e9cf0207c784fe37`  
Confirmatory report SHA-256: `499d7d0c0952428c9f305bab7c73123f70770f20599d9f779a645739bb23a94f`  
Diagnostic protocol SHA-256: `22040e88c66e0183ecb45eae2ea8dc9e10c93403f55d7385bb0a63cd504e4602`

## Frozen gate arithmetic

| Criterion | Candidate | Comparator / limit | Margin | Result |
|---|---:|---:|---:|---|
| Composition MAE | 0.371103 | best 0.360879 + 0.010 | +0.000224 beyond limit | FAIL |
| Transition TV vs IID | 0.707474 | IID 0.818406; improvement 0.110932 (need 0.020) | — | PASS |
| Transition TV vs persistence | 0.707474 | persistence 0.712483; improvement 0.005009 (need 0.020) | — | FAIL |
| RU class composition error | 0.310190 | best 0.245476 + 0.050 | +0.014714 beyond limit | FAIL |

## Frozen baseline comparison

Lower errors are better. The original gate uses animal-macro metrics; these are not confidence intervals.

| Generator | Composition MAE | Transition TV | Composition comparison | Transition comparison |
|---|---:|---:|---|---|
| iid | 0.360879 | 0.818406 | better than semi-Markov | worse than semi-Markov |
| persistence | 0.370502 | 0.712483 | better than semi-Markov | worse than semi-Markov |
| markov | 0.369417 | 0.764043 | better than semi-Markov | worse than semi-Markov |
| semimarkov | 0.371103 | 0.707474 | reference semi-Markov | reference semi-Markov |

The IID baseline had the best composition score (0.360879); first-order Markov had the next-best (0.369417). Semi-Markov had the lowest transition TV (0.707474), but its 0.005009 improvement over persistence did not meet the frozen 0.02 margin. No baseline is a generally valid behavior generator.

## Coverage, censoring, and generated sequence diagnostics

Across the source, the readiness audit found 1305 operational exact-minute windows, 1281 discontinuities, and zero complete 24-hour windows. The table combines source-wide censoring counts with the confirmatory subset's observed and replayed internal runs; these populations are labeled separately.

| Class | Confirmatory minute share | Source runs | Boundary-censored source runs | Confirmatory complete durations: median [Q25, Q75] min (n) | Semi-Markov generated durations: median [Q25, Q75] min (n) | Train duration support: n / median min |
|---|---:|---:|---:|---:|---:|---:|
| GR | 0.424 | 635 | 71.8% (179 complete across source) | 5 [3.5, 7.0] (n=19) | 3.0 [1.0, 6.0] (n=782 synthetic) | 160 / 4.0 |
| RE | 0.258 | 571 | 84.1% (91 complete across source) | 2.0 [1.0, 2.0] (n=12) | 1 [1.0, 2.0] (n=787 synthetic) | 79 / 1 |
| RU | 0.062 | 267 | 98.9% (3 complete across source) | 10 [10.0, 10.0] (n=1) | 6.0 [6.0, 18.0] (n=324 synthetic) | 2 / 12.0 |
| WA | 0.256 | 356 | 68.5% (112 complete across source) | 1.5 [1.0, 6.75] (n=10) | 1 [1.0, 2.0] (n=717 synthetic) | 102 / 2.0 |

The generated medians are conditional on fixed target windows and sampled training durations; they are not estimates of biological bout duration. The semi-Markov training sample for RU contained only two complete durations across 20 animals.

### Short-window sensitivity of missing-class diagnostics

The observed target windows average only about six minutes; every synthetic replicate inherits that exact short length. Single-class outputs at one- or two-minute length are structurally expected, so the overall single-class rate alone is not evidence of mode collapse.

| Target length (minutes) | Observed windows | Semi-Markov single-class rate | IID single-class rate | Markov single-class rate |
|---|---:|---:|---:|---:|
| 1 | 85 | 100.0% | 100.0% | 100.0% |
| 2 | 38 | 71.6% | 29.7% | 48.9% |
| 3-5 | 49 | 44.6% | 6.0% | 16.6% |
| 6-15 | 39 | 23.1% | 0.3% | 0.5% |
| 16+ | 15 | 3.7% | 0.0% | 0.0% |

Length-stratified rates should be read against the matching short sequence length and are descriptive only. Persistence is degenerate by construction; semi-Markov omission rates above IID/Markov warrant further protocol work, but do not by themselves prove biological implausibility.

| Generator | Single-class generated windows | Missing class occurrences / window | Switches / generated minute |
|---|---:|---:|---:|
| iid | 44.0% | 1.948 | 0.579 |
| persistence | 100.0% | 3.000 | 0.000 |
| markov | 49.5% | 2.057 | 0.434 |
| semimarkov | 63.5% | 2.441 | 0.158 |

## Per-animal variation

The table reports the already frozen held-out scores, not uncertainty estimates. Window counts differ; these four animals cannot establish population-level heterogeneity.

| Generator | Animal | Windows | Composition MAE | Transition TV | RU composition error |
|---|---|---:|---:|---:|---:|
| iid | AH:2008 | 37 | 0.326023 | 0.767675 | 0.152723 |
| iid | BH:5111 | 68 | 0.360641 | 0.848088 | 0.143619 |
| iid | BR:8065 | 74 | 0.381865 | 0.862690 | 0.332860 |
| iid | RC:35 | 47 | 0.374987 | 0.795170 | 0.352701 |
| persistence | AH:2008 | 37 | 0.342791 | 0.672967 | 0.164146 |
| persistence | BH:5111 | 68 | 0.355515 | 0.691304 | 0.120588 |
| persistence | BR:8065 | 74 | 0.390372 | 0.726979 | 0.339189 |
| persistence | RC:35 | 47 | 0.393330 | 0.758681 | 0.377660 |
| markov | AH:2008 | 37 | 0.343325 | 0.749891 | 0.212658 |
| markov | BH:5111 | 68 | 0.369004 | 0.781380 | 0.179542 |
| markov | BR:8065 | 74 | 0.385318 | 0.784776 | 0.368869 |
| markov | RC:35 | 47 | 0.380023 | 0.740125 | 0.416852 |
| semimarkov | AH:2008 | 37 | 0.335997 | 0.615805 | 0.267612 |
| semimarkov | BH:5111 | 68 | 0.370710 | 0.706209 | 0.195439 |
| semimarkov | BR:8065 | 74 | 0.387530 | 0.759971 | 0.363445 |
| semimarkov | RC:35 | 47 | 0.390175 | 0.747910 | 0.414264 |

Semi-Markov held-out composition ranges from 0.336 to 0.390, while transition TV ranges from 0.616 to 0.760. This is a visible descriptive spread, but four same-source animals and unequal windows are too few to decide whether population heterogeneity is excessive or to estimate its distribution.

## Findings and unresolved questions

**Supported by these artifacts:** composition performance is not better enough than IID; semi-Markov transition fidelity is only marginally better than persistence; RU composition fails its class-wise margin; and semi-Markov outputs are less diverse than IID/Markov for the same 2–15 minute target windows. The aggregate single-class rate is strongly affected by short windows: 85/226 targets contain one minute and are necessarily single-class. These diagnostics support local sequence undercoverage relative to the controls, not a conclusion of biologically implausible behavior. Temporal coverage/censoring prevents interpreting annotated-run duration as full biological bouts.

**Not established:** the cause of RU error (true rarity, recording schedule, annotator carry-forward, ranch/breed heterogeneity, or transition mismatch); population-wide inter-animal variance; daily/circadian budgets; intervention response; behavior-to-intake/weight effects; whether another model family would generalize; or biological implausibility of any generated duration distribution.

## Limits

- The four confirmatory animals come from the same Perea source/two ranch contexts and do not establish external validity.
- Generated replicates are deterministic synthetic outputs, not independent biological observations or uncertainty intervals.
- Observed runs are based on sampled exact-minute annotation windows, may touch window boundaries, and are affected by the source sub-30-second carry-forward rule.
- No complete 24-hour windows exist; circadian activity budgets are unsupported.
- No intervention, forage availability, climate exposure linkage, physiology, DMI, ADG, or weight outcomes were measured by this comparison.
- The replay is a post-hoc descriptive diagnostic on an already opened holdout. It cannot be used to modify or select this candidate.
