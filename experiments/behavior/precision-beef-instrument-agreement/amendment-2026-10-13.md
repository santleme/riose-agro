# Pre-fit protocol amendment: 90-second temporal windows

**Dated:** 2026-10-13, before any model fitting or scoring on Precision Beef rows.

This amendment changes the analysis time unit and stream-alignment rule for the
Precision Beef instrument-agreement diagnostic. The original
[`preregistration.json`](preregistration.json) and
[`preregistration.md`](preregistration.md) are retained unchanged as the
historical, pre-fit exact-timestamp plan. This amendment supersedes only the
exact-timestamp alignment and one-second eligibility clauses. The source,
features, instrument-derived target, fixed model, weights, source split,
metrics, and interpretation limits remain as preregistered.

## Reason for amendment

The primary article describes analysis in 90-second blocks
([DOI 10.3390/s22062323](https://doi.org/10.3390/s22062323)). A preliminary
alignment audit found that an exact-timestamp inner join paired only about
0.1% of the two streams for animal 12. Exact timestamp equality therefore
discarded nearly all potential temporal coverage for that animal and does not
match the published analysis unit. These observations motivate changing the
aggregation rule before fitting; they do not establish that the streams are
fully synchronized or that the resulting diagnostic is externally valid.

## Frozen amended cohort construction

1. Use each animal's `Collar Start Timestamp` in the downloaded Zenodo
   `Readme.md` summary table as the shared anchor for both devices. The README
   reports timestamps to whole-second precision; keep its source-naive wall
   clock and do not infer or shift the anchor from observed CSV rows.
2. For timestamp `t` and anchor `a`, assign the sample to
   `k = floor((t - a) / 90 seconds)`. Window `k` is the half-open interval
   `[a + 90k, a + 90(k+1))`. A sample exactly on a boundary belongs to the
   following window.
3. Stream each device independently by event time and aggregate it into these
   common wall-clock bins. Do not join timestamps, pair row indices, use a
   nearest-neighbor rule, shift either time series, or interpolate.
4. A bin is in the analysis cohort when it contains at least one valid collar
   sample and at least one valid halter classification. Retain all such bins
   even when their sample counts differ or are below nominal 10 Hz coverage.
   Report union-bin, collar-only, halter-only, and common-bin counts, plus
   valid sample counts for each instrument. Invalid values and duplicate
   timestamp groups do not contribute; no synthetic samples are added.
5. Compute the fixed twelve features from collar x/y/z values only, using the
   arithmetic mean, population standard deviation, minimum, and maximum in the
   bin. Compute the reference outcome separately as the halter classification
   majority among valid halter samples. Keep tied majorities as null and flag
   them; they remain in coverage counts and are excluded from fitting/scoring.
6. Preserve all union bins in the processed outputs and flag `is_partial_boundary`
   whenever a 90-second window extends outside the README-advertised interval.
   The advertised end is interpreted as inclusive at its displayed second, so
   its exclusive bound is one second later. Exclude partial-boundary bins from
   fitting and scoring, but report their counts. Do not pad them or interpolate.
7. For fitting and scoring, exclude partial-boundary bins, tied or invalid
   halter majority labels, bins missing either valid stream, bins with
   missing/nonfinite collar features, and bins with fewer than 800 valid
   samples in either stream. The threshold is fixed before fitting at 800 of
   the nominal 900 samples per 90-second stream (88.9%); it addresses partial
   temporal coverage observed in a small number of windows. Keep every window
   in the processed Parquet. Report per-window collar/halter sample counts,
   below-threshold counts, and all other exclusions. Do not impute or pad.
8. Preserve the README source split exactly: animals 04, 10, and 11 remain
   source test; all other animals remain source train. Animal grouping remains
   the split unit. Test animals are never used for development, fitting,
   feature selection, or preprocessing.

## Status and limits

This is an exploratory instrument-agreement diagnostic, not a confirmatory
analysis or independent validation. The frozen amended pipeline was run after
registration; its result is in [`results-90s.json`](results-90s.json) and the
human-readable summary is in [`results-90s.md`](results-90s.md). The full
coverage counts are retained before the model metrics are interpreted.
RumiWatch remains an instrument-derived reference, the source merges drinking
into eating, and the source-test animals were already used in the primary
article. The cohort does not support claims about human ground truth,
farm/trial transport, grazing behavior, DMI, or the Riose simulation.
