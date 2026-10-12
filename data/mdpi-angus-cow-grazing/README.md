# Adult beef cows grazing dormant mixed-grass rangeland

Source: Parsons et al. (2021), [The Influence of Residual Feed Intake and Cow Age on Beef Cattle Performance, Supplement Intake, Resource Use, and Grazing Behavior on Winter Mixed-Grass Rangelands](https://doi.org/10.3390/ani11061518), *Animals* 11(6), 1518.

The official supplementary ZIP is archived as `supplement.zip`. It contains Tables S1–S5 as CSV files. The article and supplement are published under CC BY 4.0; cite the article and retain attribution when reusing the files.

## Cohort and variables

The study followed non-lactating, pregnant commercial Angus cows aged 1–10 years at the Montana State University Northern Agricultural Research Center in two dormant-season grazing studies. The article reports 205 cows in year 1 and 203 in year 2, grazing from mid-October to early January. The age bands include a one-year class, so the entire cohort should not be called mature cows. Table S1 has 408 cow-season rows and 241 distinct IDs across both years; some cows occur in both years. It reports body-weight change (kg) and body-condition-score change, with five missing weight-change values (all in year 1) and three missing BCS values. Table S2 has daily individual supplement intake and feeder behavior. Table S3 has grazing time and distance for the GPS subset. Tables S4–S5 contain spatial-use metrics.

The article describes body-weight change over an 84-day grazing period. The explorer derives a period-average daily weight change as `Tot_Wt_Ch_kg / 84`; this is **derived ADG**, not a directly reported daily measure. Table S1 does not include individual start/end dates or day counts, so the 84-day duration cannot be checked per row. The article describes individual body-weight and BCS measurements after a 16-hour shrink pre- and post-grazing. The five missing weight-change and three missing BCS records are retained as missing; the article does not explain them.

The published supplement does **not** provide individual forage DMI, pasture-level costs, or a paired confinement arm. Age classes follow the paper: 1, 2, 3, 4, 5–7, and ≥8 years. The one-year class should not be described as mature cows.

This is a separate exploratory cohort. Do not merge it with USDA/CPER, USDA/CGREC, or Swiss Zenodo observations, and do not interpret age/RFI associations as causal effects of grazing or supplementation.

Reproduce the source-integrity and coverage summary with `npm run audit:mdpi-angus-cow-grazing`.
