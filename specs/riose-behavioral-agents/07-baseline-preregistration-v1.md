# Perea generative baseline protocol v1

**Status: frozen before running the new baseline evaluator on held-out sequences.** This is an exploratory, within-source sequence benchmark. It is not a prospective external validation or a biological validation of FarmEngine.

## Data and eligibility

Use only the canonical eligible observations from `docs/evidence/perea-time-series-readiness.json`, produced by the existing duplicate policy: collapse same-label animal-minute repeats to one mean-MI observation and exclude every row at a contradictory-label minute. Split sequences at any non-exact one-minute timestamp difference. A window is an operational observed coverage window, not source-declared video metadata. Behavior labels are WA/GR/RE/RU; keep them separate from FarmEngine actions. Never use MI in generation.

## Frozen animal partitions

Partition by `Breed:ID`, not row or window. Assignment algorithm: sort breed codes; sort IDs within breed; initialize `random.Random(20261015)`; shuffle each breed list in order using that shared RNG; reserve the first animal in each breed as a confirmatory holdout; assign the remaining five animals per breed in their shuffled order to development folds 0–4.

| Partition | Held-out animals |
| --- | --- |
| Confirmatory holdout (sealed until candidate code and selection rules freeze) | AH:2008, BH:5111, BR:8065, RC:35 |
| Development fold 0 | AH:2003, BH:4589, BR:8063, RC:6 |
| Development fold 1 | AH:2013, BH:4511, BR:7001, RC:2061 |
| Development fold 2 | AH:2009, BH:4085, BR:8089, RC:2024 |
| Development fold 3 | AH:2019, BH:6495, BR:8073, RC:1067 |
| Development fold 4 | AH:2004, BH:4071, BR:8071, RC:9012 |

Each development run trains only on the other 16 development animals, then generates complete synthetic windows matching the held-out window lengths. No held-out label or sensor feature is passed to the generator. The four confirmatory animals are excluded from every development fit and score. Do not publish their scores until candidate families, source, and selection decision are frozen in a later commit.

## Candidates and generation

Use 20 independent replicates per held-out window. Derive each random seed as the first 64 bits of SHA-256 over UTF-8 `perea-baseline-v1|20261015|candidate|fold|animal|window-index|replicate`. Sort all training rows before fitting.

1. **IID:** draw every minute independently from a class prior formed by averaging each training animal's class proportions with equal animal weight.
2. **Persistence:** draw one class from that same prior and hold it for the full generated window.
3. **First-order Markov:** draw the initial class from that prior. Estimate each source-class transition row from contiguous training transitions by normalizing each training animal's row counts before taking an equal-animal mean. Add symmetric 0.5 Dirichlet pseudocounts to the resulting class row and normalize. If a training class has no outgoing transition, use the class prior as its row.

Every candidate receives training observations and output lengths only. No observed MI, future label, test label, or hidden engine state is accepted at prediction time. Models have no parameters tuned on development outcomes. The fixed 20 replicates describe simulator variability, not additional biological samples.

## Frozen metrics

Report raw eligible class-minute support and window/animal counts. For each held-out animal, average across its windows, then report animal-macro means and all per-animal values:

- **Primary composition error:** macro-average absolute difference between four-class observed and generated proportions per window, averaged over 20 replicates. Lower is better.
- **Primary transition error:** mean row-wise total variation distance between observed and generated first-order transition rows, over source states with at least 20 training transitions and at least one observed held-out transition; then average by animal. `TV(p,q)=0.5*sum(abs(p-q))`. Report eligible rows and denominators; mark unavailable if none.
- **Secondary complete-run error:** per-class absolute difference in median observed annotated-run length, counting only runs wholly inside a window; report censored edge runs and supported sample counts. Do not call this an unbiased biological duration.
- **Diagnostics:** fraction of generated windows with one class only, missing-class rate, and consecutive label switches per minute. No confidence interval or probability claim.

Use the same target window lengths and seed schedule for all candidate comparisons. Do not pool generated replicates as independent animals. Do not bootstrap minutes; if uncertainty is later reported, resample animal clusters and state the limited 20-animal development population.

## Negative controls and stop rules

- Automated checks fail on any animal partition overlap, use of future/test labels or MI, non-deterministic replay, candidate output length mismatch, a non-ontology class, or transitions crossing a gap.
- A baseline score is descriptive only and cannot promote a model. Do not modify candidate definitions or thresholds after opening scores.
- Any later semi-Markov candidate is eligible for a *separate confirmatory review* only if, on development animals, its composition error is no more than the best simple baseline +0.01, transition TV improves over both IID and persistence by at least 0.02, and no supported class composition error is more than 0.05 worse than the best baseline. Then freeze candidate code and decision before opening the four confirmatory animals. Failure is NO-GO for this dataset/candidate; it is not evidence about cattle behavior generally.
- BEH-002 baseline results themselves do not pass Gate C, Gate D, or Gate E. No behavior model is enabled by default; no changes to FarmEngine.
