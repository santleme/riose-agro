# Observed daily DMI variability: Nellore feedlot cohort

This is a separate descriptive analysis for the observed feedlot cohort. It does not validate pasture DMI, the Riose engine, or individual predictions.

## Cohort and source

- Population: 22-month-old steers (Bos taurus indicus (Nellore cattle)) in a controlled tropical feedlot study; Shade and No shade; 47 animals across four collective pens (two pens per treatment, per associated article).
- Outcome: observed daily dry matter intake in **kg dry matter per animal per day**.
- Source: [Mendeley Data DOI 10.17632/cctgpznjrc.1](https://doi.org/10.17632/cctgpznjrc.1), licensed CC BY 4.0; SHA-256 verified.
- Observed DMI: 3757 animal-days, 47 animals, 82 dates; 97 missing animal-days excluded without imputation.

## Sequential descriptive decomposition

Observed mean: 11.5948 kg DM/animal/day; sample SD: 2.6050.

The sums of squares below are added sequentially in this fixed order: treatment group, animal identity within treatment, calendar date after animal, then remaining animal-day residual. They are a descriptive, order-dependent fixed-effect partition, not estimates of random-effect variance components.

| Component | Sum of squares | Share of centered total |
|---|---:|---:|
| `treatment_between_animals` | 25.7264 | 0.1% |
| `animal_within_treatment` | 5395.5347 | 21.2% |
| `calendar_date_after_animal` | 3394.5440 | 13.3% |
| `unexplained_animal_day_residual` | 16673.4200 | 65.4% |

Treatment-specific summaries are descriptive only:

- **No shade:** 1837 animal-days, 23 animals, mean 11.6794 kg DM/animal/day (SD 2.5752).
- **Shade:** 1920 animal-days, 24 animals, mean 11.5138 kg DM/animal/day (SD 2.6314).

## Interpretation and limits

- This is an exploratory description of one feedlot cohort, not evidence for mature beef cows grazing pasture or the DMI target in issue 109.
- Treatment is constant within animal and associated with collective pen assignment. The treatment share is a descriptive between-group sum of squares, not an independently replicated treatment variance or causal shade effect.
- The animal term is the sequential contribution of animal identity after the treatment grouping. It is not measurement error and does not separate stable animal differences from all other animal-level factors.
- The calendar-date term is a common date contribution conditional on animal identity. It is not attributed to weather or another cause.
- The residual combines remaining animal-day variation and any unmeasured influences; no independent replicate measurement exists here to identify measurement error.
- Sums of squares are sequential and order-dependent. No bootstrap quantiles or calibrated prediction intervals are produced.
- No engine outputs, liveweight values, model predictions, parameter fitting, or motor-versus-DMI metrics are used.
- DMI contains 97 missing animal-day values; they are excluded without imputation.

## Reproduction

```bash
python3 scripts/science/source-audits/analyze_mendeley_nellore_dmi_sequential_partition.py
python3 -m unittest discover -s tests -p 'test_mendeley_nellore_dmi_sequential_partition.py' -v
```
