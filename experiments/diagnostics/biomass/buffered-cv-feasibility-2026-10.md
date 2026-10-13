# Biomass buffered-CV structural feasibility (pre-fit)

**Outcome-blind structural check:** no biomass values, OOF predictions, or model fits were read or produced.

Parquet input: `data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet`; registry SHA-256 `ccc626011de7445769efc72a1168fea99a7b1db6e2c4d87b8fdd9f2f987e4fc7`. Columns projected: `campaign, farm, field_code, pixel_id, sampling_point_id, sward_height_cm, latitude_deg, longitude_deg`.

Design: Leave-one-out by connected component of farm+field codes, where fields sharing an exact latitude/longitude are joined; all campaigns for each block remain together. Buffer: For each held-out block, remove every candidate training coordinate whose nearest great-circle distance to any held-out coordinate is less than 100 m.

Feature-complete rows: **234**; coordinate-deduplicated blocks: **13** from 14 fields; exact-coordinate groups: **117**.

Structurally scoreable rows: **234/234 (100.0%)**. Blocks with nonempty training: **13**. Gates met: coverage ≥70% = **True**; at least 4 held-out blocks = **True**.

After the 100 m buffer, fold training rows range from **210 to 216** (median 216); unique training coordinates range from **105 to 108**.

| Held-out block | Fields | Test rows | Test coordinates | Training rows after buffer | Training coordinates |
|---|---|---:|---:|---:|---:|
| Poderosa/A2_T1_P1 | A2_T1_P1 | 18 | 9 | 216 | 108 |
| Poderosa/A2_T3_P1 | A2_T3_P1 | 18 | 9 | 210 | 105 |
| Poderosa/A2_T3_P2 | A2_T3_P2 | 18 | 9 | 210 | 105 |
| Santa Clara/A1a_T1_P6 | A1a_T1_P6 | 18 | 9 | 216 | 108 |
| Santa Clara/A1a_T3_P17 | A1a_T3_P17, A1b_T3_P17 | 18 | 9 | 216 | 108 |
| Santa Clara/A1a_T7_P7b | A1a_T7_P7b | 18 | 9 | 216 | 108 |
| Santa Clara/A1a_T7_P8 | A1a_T7_P8 | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T2_P2 | A1b_T2_P2 | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T2_P5 | A1b_T2_P5 | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T2_PA | A1b_T2_PA | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T2_PD | A1b_T2_PD | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T3_P13 | A1b_T3_P13 | 18 | 9 | 216 | 108 |
| Santa Clara/A1b_T8_P1 | A1b_T8_P1 | 18 | 9 | 216 | 108 |

The proposed row-coverage and block-count gates are structurally feasible under this exact leave-one-coordinate-deduplicated-field-component-out design: all feature-complete rows are scoreable by the nonempty-training criterion and 13 blocks are available. Each fold retains 210–216 feature rows across 105–108 unique coordinates after the 100 m exclusion. This establishes only design feasibility; it does not establish statistical independence, target quality, external farm validation, or predictive performance. The 13 blocks are nested in only two farms.
