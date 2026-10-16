# Behavioral external data and provider API audit — October 2026

**Audit date:** 2026-10-15. This is a source-screening note, not a legal opinion or a scientific validation. It records public metadata and paper-reported methods; where data files or grants were not inspected, that is stated explicitly. No author was contacted and no paid API was called.

## 1. Tabapuã study, DOI 10.37496/rbz5520250201

The primary article is [Silva et al., “Performance of multiple models under different test strategies in predicting the ingestive behavior of grazing cattle”](https://www.scielo.br/j/rbz/a/jJVd9hScskhKfP6GsNzbShN/?format=html&lang=en), published in the *Revista Brasileira de Zootecnia* collection on 2026-08-03 (article accepted 2026-03-11). Its title DOI is [10.37496/rbz5520250201](https://doi.org/10.37496/rbz5520250201).

### Verified study facts

- The cohort was nine Tabapuã heifers (initial BW 185 ± 17 kg), studied at UFLA from November 2019 through July 2020 on an intermittent mixed *Urochloa brizantha* / *Arachis pintoi* pasture. Two randomly chosen heifers grazed on each observation day. There were 96 12-hour visual observation periods on 48 non-consecutive days, approximately 06:00–18:00, across spring, summer, and autumn. Observation days represented entry at 25 cm sward height and exits near 20, 15, or 10 cm.
- Trained observers continuously recorded behavior changes with date, animal identification, and hour/minute/second transition time. A 3-axis neck accelerometer recorded at 1 Hz. Paper methods say the visual and sensor records were joined on date, ID, and time; final analytic classes were grazing, ruminating, and idle, with grazing/non-grazing also used. Drinking and atypical behavior observations were removed from the final dataset.
- The merged analytic data comprised 607,150 points versus 2,073,600 expected from the nominal 96 × 12 h × 1 Hz design (29.28% retained, i.e. 70.72% absent/mismatched). Thus it is a sampled, daylight-only, incomplete observation set—not continuous complete-day or year-round animal trajectories. The paper also reports the sensors and observer clocks were synchronized before observation.
- The article reports poorer performance on an external cohort and that random holdout gave the greatest accuracies; its own motivation cautions that random splits can retain biological dependence across animals and pasture context. This supports an animal/grouped and external evaluation design; it does not validate sequence generation.

### Data availability and rights

The authors’ [data availability statement](https://www.scielo.br/j/rbz/a/jJVd9hScskhKfP6GsNzbShN/?format=html&lang=en) says the data are **not in a public repository**, but may be provided by email on request. The article page identifies the corresponding author as Marina Danes (`marina.danes@ufla.br`). The article is marked [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); that publication license must not be assumed to grant the underlying unshared microdata, participant/animal record, or any rights needed for commercial reuse. No separate data license, author permission, ethics reuse scope, or commercial authorization was verified. Do not ingest into a commercial pipeline until terms are obtained in writing.

### Data request checklist

Request a versioned de-identified table or files with:

1. Stable anonymized individual ID (and mapping sufficient to retain identity across dates without revealing farm records); observation date; local time zone and original clock convention; timestamp precision; session/day and observer IDs.
2. Every observed transition as start/end timestamp or event timestamp plus next activity; original activity vocabulary and operational ethogram; observer adjudication / disagreement / confidence fields if recorded; explicit missingness, removals, and mismatch flags. Preserve observed duration and censoring boundaries; do not infer a complete episode at the start/end of observation.
3. Observation coverage start/end per animal/session, 3-hour observer shifts, sampling schedule, missed intervals, and whether a state label was carried or imputed.
4. Context aligned by animal and time: paddock and treatment/study arm, sward height and measurement time, pasture composition/availability/nutritive value if measured, date/season, weather/solar time if collected, water access, supplementation/feeding, handling, and other management events. Identify variables measured versus derived, with units and methods.
5. Raw/processed sensor files and dictionaries separately from human visual labels; sampling rate, calibration, attachment/site, clock sync/drift, accelerometer axes/units, and merge rules. Keep visual observations as a distinct observation source, not model predictions.
6. Cohort description and animal metadata suitable for domain assessment (sex, age, breed, body weight method/date), consent/ethics information, exclusions, and a data provenance/change log.

Ask separately for written data-access terms covering commercial use, copying, transformation/derivatives, model training, redistribution or derived weights, attribution/citation, retention/deletion, publication review, and warranty/ethics constraints. A no-cost research copy without commercial derivative rights is not enough for the product pipeline.

### Draft request (not sent)

> **Subject:** Request for de-identified behavioral microdata and commercial-use terms — DOI 10.37496/rbz5520250201
>
> Dear Dr. Danes and coauthors,
>
> I am evaluating evidence sources for a research software project on transparent analysis of grazing-cattle behavior. Your Tabapuã study is especially relevant because it reports individual visual observation transitions and synchronized sensor data. Would you consider sharing a de-identified, versioned copy of the underlying observation and sensor tables, with a data dictionary and the observation/missingness rules?
>
> For sequence analysis, the essential fields are a stable pseudonymous animal ID; session/date and timestamp with time-zone/clock details; observed activity and its transition or start/end times; observation coverage boundaries; observer/session identifiers; missing or censored intervals; and time-aligned pasture, sward, weather, supplementation, and handling context where collected. We would keep human observations distinct from accelerometer records and any classifier outputs.
>
> Could you also specify the applicable data license and whether it permits commercial use, transformation and model training, distribution of derived model parameters, and publication of aggregate findings? If a separate agreement, attribution text, ethics approval, or restrictions are required, please share those terms. We will not redistribute the source data or use it commercially without explicit permission covering that use.
>
> We can provide a concise protocol and security/retention description before transfer. Thank you for considering the request.

## 2. Additional pasture behavior data candidates

| Source | What the primary record/paper establishes | Rights and fit decision |
|---|---|---|
| [USU Richmond grazing cattle data, Ag Data Commons DOI 10.15482/USDA.ADC/28507400](https://agdatacommons.nal.usda.gov/articles/dataset/Multi-Sensor_Integration_and_Machine_Learning_for_High-Resolution_Classification_of_Herbivore_Foraging_Behavior/28507400); companion [Muzzo et al. 2025 article](https://pmc.ncbi.nlm.nih.gov/articles/PMC11988067/) | Catalog metadata says public, posted 2025-04-05, CC0; companion article says 24 mature Angus cows with calves, 22 collars, 5-minute GPS/accelerometer signals, and visually observed ground-truth from three focal cows over three days (27–29 Aug 2024), 12-hour/day sensor observation. Five behaviors were grazing, walking, resting, rumination, drinking; labels were changed only when duration exceeded 3 minutes, with shorter transitions carried into the preceding behavior. The public package is listed as 415.57 kB. | **Promising, conditionally eligible source**: catalog-level CC0 is explicit and the cohort/context are close to pasture sequence work. However, this audit could not retrieve the archive through the browser tool (403), so actual columns, stable animal-ID encoding, timestamp coverage, annotation content, and archive-level license were not verified. Before a pipeline import, download through an authorized public route, checksum it, inspect files/license, and confirm whether the three labeled cows have contiguous observation sequences. This is not yet a held-out evaluation cohort. |
| [USDA CPER foraging metrics, DOI 10.15482/USDA.ADC/1524788](https://catalog.data.gov/dataset/data-from-can-measurements-of-foraging-behaviour-predict-variation-in-weight-gains-of-free) | USDA/Data.gov catalog marks public-domain license and lists daily Moonitor metric files and dictionaries. Article describes yearling steers on shortgrass rangeland, GPS at 5-minute intervals and sensor-inferred grazing at 4-second intervals; direct observation was used for concurrent sensor reliability checks, while the released catalog files include daily metrics and period-level ADG. | **Commercial reuse appears permissible for the published dataset under its catalog public-domain mark, subject to verifying files and provenance.** Good for separate daily foraging covariate/weight-gain analyses; not a human-labeled full activity sequence corpus and not evidence to generate behavior. It is a distinct young-steer cohort. |
| [Perea rangeland labeled sensor dataset, Figshare DOI 10.6084/m9.figshare.28801181](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181) | The Figshare record says CC BY 4.0; 24 mature beef cows across two ranch contexts; IDs, timestamps, minute motion index and human-reviewed labels WA/GR/RE/RU (plus brief other observations). Labels summarize events at 1-minute granularity. | **Eligible with attribution under the record license**, subject to retained cohort/source gates. This is the already-evaluated BEH source, not independent new evidence; limited sampled windows and carry-forward annotations remain important. |
| [Japanese Black dataset, Zenodo DOI 10.5281/zenodo.5849025](https://zenodo.org/records/5849025) | Six individually separated cow CSVs; 25 Hz accelerometer, Unix/JST timestamps, 13 video-labeled classes; one day in a farm with both grass field and pens, 197 minutes labeled. | Record license is **CC BY-NC-ND 4.0**, so **exclude from commercial training/derivatives**. Useful only for separately authorized noncommercial classification research; not a commercial sequence-generation source. |
| [Free-grazing dairy IoT collar dataset, article/repository](https://pmc.ncbi.nlm.nih.gov/articles/PMC12426180/) and [GitHub data repository](https://github.com/WASP-lab/db-cow-walking) | Paper says 10 dairy cows, 441 labeled events / 7 h 34 min, individual IDs and start-time metadata, CSV signal for each annotated event, 10 Hz sensor recordings, behavior labels; events from grazing pasture over a five-month collection period. | Paper is CC BY, but the public data repository does not expose a dataset license in its file list/readme. **Rights are unresolved**: public GitHub access does not grant commercial reuse. Keep out of commercial pipeline unless repository authors attach a data license or grant permission. Sequence is sparse event clips, not continuous time. |
| [CVB visual cattle behavior dataset, CSIRO portal record](https://data.csiro.au/categories/kw/Cattle) and [authors’ repository](https://github.com/RenukaSharma/CVB_dataset) | Portal describes 502 grazing-cattle video clips, 15 s each, 30 fps frame stacks and JSON behavior/bounding-box annotations. | Static portal view did not verify a license or public dataset terms; CSIRO collection page required JavaScript in this audit. Clips support visual classification/localization, but do not establish continuous individual-animal event histories. **Do not use commercially until exact collection license and redistribution/training permissions are verified.** |

“Public” and “downloadable” are not synonyms for permission to train or sell derived models. The screening uses an explicit dataset record license where one is shown; otherwise rights stay unresolved. A paper’s open-access license is not a substitute for a dataset license.

## 3. Current official Groq and Hugging Face API contract relevant to BEH-005

Checked official provider documentation on 2026-10-15; no API request was made.

### Groq

- The current OpenAI-compatible Chat Completions endpoint is `POST https://api.groq.com/openai/v1/chat/completions`; the official [API reference](https://console.groq.com/docs/api-reference) documents `messages`, `model`, `stream`, `response_format`, and completion limits. BEH-005’s endpoint/protocol and `max_completion_tokens` field align with the current documented API shape.
- Groq [strict Structured Outputs documentation](https://console.groq.com/docs/structured-outputs) currently lists `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, and `qwen/qwen3.8-27b` as strict JSON Schema models. The configured BEH-005 default `openai/gpt-oss-20b` is listed as capable. Groq states structured outputs are incompatible with streaming and provider tool use; BEH-005 uses `stream: false`, sends `response_format` and executes only its own server allowlist, which is consistent with that restriction.
- Groq’s [model catalog](https://console.groq.com/docs/models) and the [GPT-OSS 20B model card](https://console.groq.com/docs/model/openai/gpt-oss-20b) list current support, limits, and pricing. Therefore BEH-005 should retain its output-token and timeout caps and should not assume that all Groq models accept strict schema mode. Provider errors should continue to fail closed to deterministic parsing.

### Hugging Face Inference Providers

- The official [OpenAI-compatible Chat Completion docs](https://huggingface.co/docs/inference-providers/tasks/chat-completion) use `https://router.huggingface.co/v1` with `/chat/completions`. Thus BEH-005’s `https://router.huggingface.co/v1/chat/completions`, `Bearer` auth, OpenAI-style `messages`, `max_tokens`, non-stream response parsing and `response_format: {type:"json_schema", ...}` fit the documented interface. The docs mark `max_tokens` and strict JSON Schema in the request schema; as always, model/provider capability may differ, so server-side schema validation remains mandatory.
- HF documents model suffix routing: `:cheapest` selects the lowest output-token-cost provider, `:fastest` the highest-throughput provider, `:preferred` the user-configured order, and `:<provider>` can pin a provider. So the configured `openai/gpt-oss-120b:cheapest` is a documented model-id form, but it deliberately delegates provider choice and variable cost to the HF router.
- A fine-grained HF token needs the “Make calls to Inference Providers” permission. Current [billing docs](https://huggingface.co/docs/inference-providers/pricing) say free accounts have no monthly credits and require purchased credits or upgrade to use routed inference; PRO and Team/Enterprise currently receive $2 general compute credits/month. Do not present HF as a guaranteed free fallback. Keep it opt-in, server-only, and budgeted.

**Adapter decision:** no endpoint correction is required from this documentation check. Retain strict response validation and deterministic fallback. Add operational configuration/monitoring for cost caps and selected model/provider; ensure the UI discloses when a paid provider is configured. Avoid relying on provider-native tool execution or reasoning-output formats. Provider APIs and model availability are mutable; re-check before deployment.

## 4. Source register and dates

All sources below were accessed 2026-10-15. Dates are publication/repository dates displayed by the first-party source, where present.

| Primary URL | Displayed source date / role |
|---|---|
| https://www.scielo.br/j/rbz/a/jJVd9hScskhKfP6GsNzbShN/?format=html&lang=en | Article collection publication 2026-08-03; full methods, data-availability statement, CC BY article notice |
| https://doi.org/10.37496/rbz5520250201 | Target article DOI |
| https://agdatacommons.nal.usda.gov/articles/dataset/Multi-Sensor_Integration_and_Machine_Learning_for_High-Resolution_Classification_of_Herbivore_Foraging_Behavior/28507400 | Repository record posted 2025-04-05; CC0 metadata |
| https://pmc.ncbi.nlm.nih.gov/articles/PMC11988067/ | Companion research article, accepted 2025-03-20; methods and data citation |
| https://catalog.data.gov/dataset/data-from-can-measurements-of-foraging-behaviour-predict-variation-in-weight-gains-of-free | USDA ARS catalog, data last updated 2025-11-21; public domain metadata |
| https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181 | Perea data record posted 2025-04-16; CC BY 4.0 |
| https://zenodo.org/records/5849025 | Japanese Black record published 2022-01-17; CC BY-NC-ND 4.0 |
| https://pmc.ncbi.nlm.nih.gov/articles/PMC12426180/ | Free-grazing IoT dataset paper, accepted 2025-08-11; data repository link and methods |
| https://github.com/WASP-lab/db-cow-walking | Public repository page inspected 2026-10-15; no dataset license found in visible root files/readme |
| https://data.csiro.au/categories/kw/Cattle | CSIRO catalogue page displayed CVB dataset entry dated 2023-06-12; exact per-record license not established in static page |
| https://github.com/RenukaSharma/CVB_dataset | Authors’ repo README; points to CSIRO collection `csiro:58916v1`, 502 clips; no license file visible |
| https://console.groq.com/docs/api-reference | Current official API reference; accessed 2026-10-15 |
| https://console.groq.com/docs/structured-outputs | Current official strict JSON Schema support list; accessed 2026-10-15 |
| https://console.groq.com/docs/models | Current official model catalog; accessed 2026-10-15 |
| https://huggingface.co/docs/inference-providers/tasks/chat-completion | Current official API schema and endpoint; accessed 2026-10-15 |
| https://huggingface.co/docs/inference-providers/main/index | Current official provider selection and model suffix rules; accessed 2026-10-15 |
| https://huggingface.co/docs/inference-providers/pricing | Current official billing/credit rules; accessed 2026-10-15 |

