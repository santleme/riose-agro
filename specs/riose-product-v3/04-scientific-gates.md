# Scientific gates and domain limits

## FarmEngine

Current engine weight, feed, weather, water, activity and cost behaviors are deterministic demonstrations. A better chart, reproducible output, or passing tests does not make them livestock predictions. Product labels must retain that distinction at input, review, output, export and AI explanation points.

## BR-CORTE 2023 Eq. 2.6

The existing audited implementation is `br-corte-2023-eq-2.6@2023`. It estimates DMI from body weight, supplement and supplied ADG for growing Zebu cattle grazing tropical pasture with supplementation. The published independent-validation bank has 174 experimental units and is reported separately from the development fit. The implementation reproduces worked Table 2.14. These facts support a bounded equation calculator, not a claim that Riose has independently validated farm outcomes.

- ADG is a required input/scenario assumption; the equation does not predict ADG or weight gain.
- Expose the audited ranges: BW 133–474 kg; ADG −0.18–1.34 kg/day; supplement 0–5.32 kg DM/head/day.
- Any population total is transparent multiplication of an explicitly specified representative animal/distribution; do not fabricate heterogeneity.
- Supplement cost is available only when price/currency and dry-matter basis are explicitly supplied. Do not reuse FarmEngine illustrative prices.
- Total DMI is the equation output. `total DMI - supplement` is arithmetic residual and must not be labelled validated forage intake.
- No pasture depletion, gain, heat, water, behavioral, profit, or causal supplementation response is inferred.
- Cite the official source and validation statistics; state evidence status and equation-level limitations.

## Paid customer gate

Do not enable paid-customer decision use until a versioned quantitative capability has: a signed domain statement; independent reference/data check appropriate to its claimed use; frozen evaluation protocol; metrics and failure analysis; domain expert review; clear UI limitations; and reproducible saved-run evidence. No gate is passed by UI completion or formula unit tests alone.
