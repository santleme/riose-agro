# Open scientific data discovery — October 2026

The broad search covered Dryad, Zenodo, Figshare, DataCite/OpenAlex/Crossref, USDA Ag Data Commons/ARS/Data.gov, Embrapa/REDAPE, Hugging Face, Kaggle, Mendeley, university Dataverse, OSF, CSIRO, and public GitHub in English, Portuguese, and Spanish. The source-by-source record, units, methods, group keys, access checks, and decisions are in [`open-scientific-data-discovery-2026-10.json`](open-scientific-data-discovery-2026-10.json).

## Candidate decisions

| Source | Population and target | Access and rights | Decision for Riose |
|---|---|---|---|
| [Dryad Mezzalira, 10.5061/dryad.9ds7r](https://datadryad.org/dataset/doi:10.5061/dryad.9ds7r) | Brazilian grazing heifers; observed short-term intake rate in g DM/min, not total DMI | CC0 metadata; file listing is public, but API download returned HTTP 401 and direct stream 403 in this audit | No import because file bytes were unavailable without the authenticated route. Would be a separate intake-rate cohort if directly downloadable. |
| [Dryad UC Davis, 10.5061/dryad.zw3r228h5](https://datadryad.org/dataset/doi:10.5061/dryad.zw3r228h5) | Finishing steers; repeated daily feedlot intake, behavior, and rumen pH | CC0 metadata; download endpoint returned HTTP 401 | Feedlot cohort only; no import while bytes require the authenticated endpoint. |
| [Dryad UC Davis, 10.25338/B8HW7R](https://datadryad.org/dataset/doi:10.25338/B8HW7R) | Feedlot steers; feed-bin intake and motivation/behavior | CC0 metadata; download endpoint returned HTTP 401 | Separate feedlot behavior/intake candidate; no import while bytes require the authenticated endpoint. |
| [Dryad dairy heifers, 10.5061/dryad.sn02v6xbd](https://datadryad.org/dataset/doi:10.5061/dryad.sn02v6xbd) | Twelve dairy heifers; feed preference intake after 30 minutes and 3 hours | CC0 metadata; download endpoint returned HTTP 401 | Not total daily DMI or beef pasture; no import. |
| [USDA CPER, 10.15482/USDA.ADC/1524788](https://catalog.data.gov/dataset/data-from-can-measurements-of-foraging-behaviour-predict-variation-in-weight-gains-of-free) | Yearling steers; measured period ADG, grazing behavior, and estimated biomass | Public domain; existing local files and checksums | Eligible for distinct grazing-behavior and bounded ADG work; no DMI. |
| [USDA CGREC, 10.15482/USDA.ADC/1524719](https://agdatacommons.nal.usda.gov/articles/dataset/27_years_of_livestock_production_data_under_different_stocking_rate_levels_at_the_Central_Grasslands_Research_Extension_Center_near_Streeter_North_Dakota/24855519) | Mostly yearlings; animal weights, ADG, grazing duration, and stocking treatments | Public domain; existing local files with verified checksums | Eligible for separate grouped ADG/management work; no individual DMI. |
| [CSIRO Image2Biomass on Kaggle](https://www.kaggle.com/competitions/csiro-biomass/data) | Australian pasture quadrats; lab-measured dry biomass, not animal intake | Kaggle account/token and acceptance of competition rules required | Not downloaded because the requested policy excludes authenticated/restricted access. |
| [Irish Grass Clover, 10.5281/zenodo.14191859](https://zenodo.org/records/14191859) | Irish pasture images; biomass, composition and height labels | Zenodo record API says CC BY 4.0; README says CC BY-NC-SA 4.0 | Conditional for noncommercial exploration only. Excluded from commercial training because terms conflict; 10+ GB image archives not downloaded. |
| [Brazil pasture biomass, 10.17632/nj72kmdj77.1](https://data.mendeley.com/datasets/nj72kmdj77/1) | Two farms, three field campaigns; harvested dry-matter yield of forage | Public Mendeley API; CC BY 4.0 | Downloaded 20 small workbooks/spatial files; processed 342 unique sampling rows into Parquet for a separate biomass module. Not DMI. |
| [Dryad mob/rotational biomass, 10.5061/dryad.79cnp5ht4](https://datadryad.org/dataset/doi:10.5061/dryad.79cnp5ht4) | Temperate US grass-legume pastures; pre-grazing forage mass and mean height | Public anonymous version ZIP; CC0 | Downloaded and checksum-verified. Processed 623 available quadrat records and 64 matched paddock-time aggregates across eight repeated paddocks. One external cohort evaluation is recorded separately; not animal DMI or ADG. |
| [Perea grazing behavior, 10.6084/m9.figshare.28801181.v2](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181) | 24 beef cattle; minute-level human-reviewed grazing, resting, rumination, walking labels | Public download; CC BY 4.0 | Existing six-fold animal-held-out evaluation and a preregistered nested comparison operate on a common temporal subset. Labels cover sampled sessions, not full-day behavior. Not DMI. |
| [XGain hourly behavior, 10.5281/zenodo.15600573](https://zenodo.org/records/15600573) | Ten adult dairy cows with pasture access; hourly classifier counts | Public anonymous ZIP; Zenodo record says CC BY 4.0, embedded README says CC BY-NC | Downloaded and processed for descriptive profiles only. No human-reference labels or raw IMU outcomes are included; commercial reuse is not cleared because license statements conflict. |

Other leads found were not treated as training data: aggregate treatment tables, dairy or feedlot studies, model-generated DMI, sensor-behavior datasets with noncommercial or conflicting terms, and repository records without verified downloadable microdata. Source-specific outcomes must remain separate: DMI rate is not total DMI, algorithm-generated behavior counts are not independent labels, and forage mass is not animal performance. The detailed JSON and linked source audits identify the record and reason for each decision.

## Initial #109 gap matrix

| Requirement | Needed for #109 | Audit result |
|---|---|---|
| Population | Mature beef cows grazing pasture | No new source found with verified records for this population |
| Outcome | Individually measured total DMI, forage plus supplement | No downloaded source with this target |
| Units | kg DM/head/day, aligned to the intake period | No matching source with verified target units |
| Method | Documented measurement or transparent derivation | No obtained matching individual intake protocol |
| Grain and time | Animal-period rows with aligned predictors/outcome | New candidates have feedlot/dairy/rate targets or are unavailable |
| Group identity | Animal plus trial/pasture keys for held-out evaluation | No obtained target-compatible source with verified group keys |
| Reuse rights | Unambiguous public direct download and suitable license | Dryad file endpoints require a bearer token in this environment; Kaggle requires account/rule acceptance; Irish license scope conflicts |
| Independent evaluation | Multiple independent compatible trials | No target-compatible cohort available |
| **Overall** | All gates pass | **NO-GO** |

The BR-CORTE pasture equation remains scoped to growing Zebu cattle on tropical pasture with supplementation. It does not extend the target population to mature cows, and the simulator does not supply independent DMI measurements.

The Dryad biomass cohort is a useful separate evaluation target but not a strict measurement match to the Brazilian Mendeley samples: Dryad reports paddock-time pre-grazing mass and height, while Mendeley does not document whether height was read before sample clipping. Its 64 external rows have eight repeated paddocks; the 24 rows above Mendeley's 2–56 cm height range are all from the mob-grazing treatment, so in-range versus extrapolation metrics are confounded by management and year.

## Processing completed

For the Mendeley Brazilian forage-biomass source, the acquisition pipeline fetched 20 measurement/spatial files through public API download URLs, checked all SHA-256 hashes, and left 16 unneeded package files un-downloaded, including the large photo archives. Processing produced 342 sample records across June 2018, November 2018, and March 2019. The unit conversion from source tonnes/ha to kg DM/ha was independently checked against dry mass from the 0.25 m² sampling area. There are no duplicate samples within a campaign; 108 spatial sampling keys recur across campaigns and must be grouped for validation.

The explicit manifest and validator establish a reusable pattern for future sources: [`data/mendeley-pasture-biomass/manifest.json`](../../data/mendeley-pasture-biomass/manifest.json), [`scientific-data-manifest-v1.schema.json`](../../schemas/scientific-data-manifest-v1.schema.json), and [`validate_scientific_data_registry.js`](../../scripts/validate_scientific_data_registry.js).

## Issue boundaries

- **#109:** remains NO-GO; none of the discovered/downloaded sources passes the mature beef-cow pasture total-DMI gate.
- **#110:** the original target remains untrained. A separate exploratory finishing-steer experiment uses leave-one-experiment-out evaluation and does not satisfy or replace #110.
- **#15:** these sources do not establish calibrated uncertainty intervals for DMI or the full simulator.
- **#96:** source decisions are cohort-specific. The Mendeley dataset is eligible only for a separate forage-biomass module.
- **#22:** closed as `NOT_PLANNED`; no independent review was performed. It is not a prerequisite for product engineering. The #109 DMI gate remains NO-GO because no eligible open cohort for mature beef cows on pasture was found.
