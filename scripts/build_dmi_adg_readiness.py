#!/usr/bin/env python3
"""Build a deterministic, reference-only DMI/ADG data-readiness matrix.

The source registry below records decisions and paths; source rows and raw
measurements stay in their existing manifests and audit reports. Re-run with
``python3 scripts/build_dmi_adg_readiness.py`` to refresh the versioned JSON
and Markdown artifacts.
"""

from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.0.0"
JSON_OUTPUT = ROOT / "docs/evidence/dmi-adg-readiness-v1.json"
MARKDOWN_OUTPUT = ROOT / "docs/evidence/dmi-adg-readiness-v1.md"


def _fact(value: Any = None, *, definition: str | None = None, reference: str | None = None) -> dict[str, Any]:
    return {"value": value, "definition": definition, "reference": reference}


# Decisions are intentionally scoped to independent, observational component
# assessment. They do not replace the #22 expert review or claim full-engine
# validation. `trainable` means records can be used as a model-training source
# within the stated component scope, not that any training has occurred.
SOURCES: list[dict[str, Any]] = [
    {
        "id": "usda-cper-behavior",
        "name": "USDA/CPER foraging behavior and weight gains",
        "manifest": "data/usda-cper/manifest.json",
        "audit": "docs/evidence/usda-cper-association.json",
        "decisionRef": "docs/caso-zootecnico-demonstrativo.md",
        "access": "available_local",
        "license": "U.S. Public Domain (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("within-study observational association exploration", definition="audit classification", reference="docs/evidence/usda-cper-association.json#/classification"),
            "animals": _fact(33, definition="unique animal IDs", reference="docs/evidence/usda-cper-association.json#/coverage/uniqueAnimals"),
            "animalObservationUnits": _fact(36, definition="animal-period rows", reference="docs/evidence/usda-cper-association.json#/coverage/animalPeriodRows"),
        },
        "population": "Yearling cattle on semi-arid Colorado rangeland; adult classification is unresolved.",
        "units": "Animal-period ADG in kg/day; DMI is not present.",
        "missingness": "See linked audit report; source has repeated animal-period observations.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Suitable only for the approved exploratory association/component scope; yearling classification, observational design and repeated animal keys constrain generalization."},
        "permissibleUse": "Exploratory observational ADG/pastejo analysis; no causal claim, adult-cow claim, or full-engine validation.",
    },
    {
        "id": "usda-cper-ltgi",
        "name": "USDA/CPER long-term grazing intensity weight gains",
        "manifest": "data/usda-cper-ltgi-2000-2019/manifest.json",
        "audit": "docs/evidence/usda-cper-ltgi-audit.json",
        "decisionRef": "docs/evidence/engine-adg-usda-cper-ltgi-check.json",
        "access": "available_local",
        "license": "U.S. Public Domain (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("Grazing-intensity study with one pasture replication per treatment", definition="audit limitation; not a causal replicated treatment design", reference="docs/evidence/usda-cper-ltgi-audit.json#/limitations/0"),
            "animalObservationUnits": _fact(1283, definition="unique animal-season keys; not a unique-animal count", reference="docs/evidence/usda-cper-ltgi-audit.json#/coverage/uniqueAnimalSeasonKeys"),
        },
        "population": "Yearling cattle (heifers and steers) managed under grazing intensities, 2000–2019.",
        "units": "One animal-season row; entry/exit weights converted to kg; derived ADG kg/day.",
        "missingness": "Exclusions, repeated keys and measurement protocol changes are described in the audit report.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Public individual seasonal gain supports a bounded ADG component diagnostic; it is not a daily trajectory or replicated causal treatment experiment."},
        "permissibleUse": "Bounded ADG component assessment with year/pasture/animal key discipline; not full-engine or causal treatment validation.",
    },
    {
        "id": "dryad-finishing-steers",
        "name": "Dryad finishing steers methane-model dataset",
        "manifest": "data/dryad-finishing-steers/manifest.json",
        "audit": "docs/evidence/dryad-finishing-steers-audit.json",
        "decisionRef": "docs/evidence/engine-dmi-dryad-finishing-check.json",
        "access": "available_local",
        "license": "CC0-1.0 (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("Five experiment-level groups; finishing-phase summaries, not paired daily trajectories", definition="audit limitations", reference="docs/evidence/dryad-finishing-steers-audit.json#/limitations"),
            "animals": _fact(446, definition="unique Project+Animal keys; raw Animal IDs repeat across experiments", reference="docs/evidence/dryad-finishing-steers-audit.json#/coverage/nUniqueProjectAnimalKeys"),
            "trials": _fact(5, definition="experiments", reference="docs/evidence/dryad-finishing-steers-audit.json#/coverage/nExperiments"),
            "missingness": _fact({"missingByColumn": "all audited columns have zero missing values"}, definition="audit's per-column missingByColumn counts", reference="docs/evidence/dryad-finishing-steers-audit.json#/coverage/missingByColumn"),
        },
        "population": "Finishing/feedlot beef steers across five experiments.",
        "units": "One animal-by-experiment summary row; DMI and ADG in kg/day.",
        "missingness": "The linked audit reports 446 complete outcome rows; no daily paired trajectory.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Open individual experiment-level DMI is usable for a fixed-default finishing component diagnostic, but not pasture transfer or full-engine validation."},
        "adg": {"status": "conditional", "trainable": True, "reason": "ADG is reported for the same finishing cohort, but it is not the approved pasture population and is a phase summary."},
        "permissibleUse": "Limited finishing/feedlot component assessment; keep experiment IDs grouped and do not transfer conclusions to grazing.",
    },
    {
        "id": "sdsu-individual-dmi",
        "name": "SDSU individual DMI on rangeland",
        "manifest": "data/sdsu-individual-dmi/manifest.json",
        "audit": "docs/evidence/sdsu-individual-dmi-audit.json",
        "decisionRef": "docs/evidence/sdsu-engine-dmi-check.json",
        "access": "available_local",
        "license": "CC BY (manifest article/supplement; see source-specific evidence)",
        "reportedFacts": {
            "studyDesign": _fact("Hay-feeding experiment; derivative restricted to seven selected non-lactating cows", definition="audit scope", reference="docs/evidence/sdsu-individual-dmi-audit.json#/scope/population_and_setting"),
            "animals": _fact(14, definition="animals with intake tags; not the seven-tag selected complete-case cohort", reference="docs/evidence/sdsu-individual-dmi-audit.json#/coverage/animals_in_intake_with_tag"),
            "animalObservationUnits": _fact(1480, definition="intake rows", reference="docs/evidence/sdsu-individual-dmi-audit.json#/coverage/intake_rows"),
            "missingness": _fact({"selectedCompleteCaseRowsWithoutMatchingForagePeriod": 147}, definition="audit quality-check count", reference="docs/evidence/sdsu-individual-dmi-audit.json#/qualityChecks/selected_complete_case_intake_rows_without_matching_forage_period"),
        },
        "population": "Rangeland grazing cohort described in the linked audit; verify eligibility for any target population before use.",
        "units": "Derived DMI kg/day from intake pounds and period mean dry-matter percentage; see manifest derivation.",
        "missingness": "Rows without forage matching are retained with derived DMI blank; see audit and manifest.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Local source and derivation are available, but derived intake and population/period limitations require a component-only interpretation."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "The paired source/audit does not establish an approved ADG outcome for the target use."},
        "permissibleUse": "DMI component diagnostic under the documented derivation; no claim of complete pasture-engine validation.",
    },
    {
        "id": "grastech-dairy-grazing",
        "name": "GrASTech dairy grazing DMI",
        "manifest": "data/grastech-dairy-grazing-dmi/manifest.json",
        "audit": "docs/evidence/grastech-dairy-grazing-dmi-engine-check.json",
        "decisionRef": "docs/evidence/grastech-dairy-grazing-dmi-engine-check.json",
        "access": "available_local",
        "license": "Etalab Open License 2.0 (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("One farm and one experiment; evaluation groups are within-study Latin-square groups", definition="audit limitations", reference="docs/evidence/grastech-dairy-grazing-dmi-engine-check.json#/limitations"),
        },
        "population": "Lactating dairy cows in a grazing supplementation experiment.",
        "units": "See audit report; linked workbooks hold animal, period, feed and herbage measures.",
        "missingness": "Use workbook-level missingness and coverage in the linked audit; not copied into this matrix.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Individual grazing-intake evidence is available, but dairy population and study-specific measurement limit transfer to beef cattle."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "The cited audit does not establish an approved paired ADG target for this assessment."},
        "permissibleUse": "Dairy grazing DMI component analysis only; do not treat it as beef-cattle validation.",
    },
    {
        "id": "usda-ars-feedlot-dmi",
        "name": "USDA-ARS individual feedlot DMI",
        "manifest": "data/usda-ars-individual-dmi-feedlot/manifest.json",
        "audit": "docs/evidence/usda-ars-feedlot-dmi-audit.json",
        "decisionRef": "docs/evidence/usda-ars-feedlot-engine-dmi-check.json",
        "access": "available_local",
        "license": "CC BY 4.0 (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("Three published finishing/feedlot experiments; treatment allocation is not summarized in the combined audit", definition="audit limitations", reference="docs/evidence/usda-ars-feedlot-dmi-audit.json#/limitations"),
            "animals": _fact(149, definition="animals across the three experiments", reference="docs/evidence/usda-ars-feedlot-dmi-audit.json#/coverage/nAnimals"),
            "animalObservationUnits": _fact(150, definition="animal-experiment rows", reference="docs/evidence/usda-ars-feedlot-dmi-audit.json#/coverage/nAnimalExperimentRows"),
            "trials": _fact(3, definition="experiments", reference="docs/evidence/usda-ars-feedlot-dmi-audit.json#/coverage/nExperiments"),
        },
        "population": "Beef cattle in feedlot experiments.",
        "units": "Individual feedlot DMI and supporting fields as listed in the audit.",
        "missingness": "See linked audit report; do not infer missing values from publication summaries.",
        "dmi": {"status": "conditional", "trainable": True, "reason": "Open feedlot DMI can support a feedlot component assessment, not a pasture-DMI claim."},
        "adg": {"status": "conditional", "trainable": False, "reason": "Performance association is not sufficient by itself to establish a paired approved ADG validation target."},
        "permissibleUse": "Feedlot DMI component analysis within dataset license and attribution terms.",
    },
    {
        "id": "dryad-grazing-yearlings",
        "name": "Dryad grazing yearling steers",
        "manifest": "data/dryad-grazing-yearlings/manifest.json",
        "audit": "docs/evidence/dryad-grazing-yearlings-audit.json",
        "decisionRef": "docs/evidence/dryad-grazing-yearlings-audit.json",
        "access": "available_local",
        "license": "CC0-1.0 (manifest)",
        "reportedFacts": {
            "animals": _fact(154, definition="unique model steer IDs", reference="docs/evidence/dryad-grazing-yearlings-audit.json#/coverage/uniqueModelSteerIds"),
            "animalObservationUnits": _fact(154, definition="model rows with ADG and body weight", reference="docs/evidence/dryad-grazing-yearlings-audit.json#/coverage/modelRowsWithAdgAndBw"),
        },
        "population": "Yearling grazing steers.",
        "units": "One ADG and body-weight record per steer; visits are interval records.",
        "missingness": "The audit reports 154 model rows; DMI and experiment ID are absent, and visit coverage is incomplete for some animals.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Open ADG and BW support a descriptive yearling reference; no experiment ID or paired starting/ending weights for this use."},
        "permissibleUse": "Separate yearling ADG descriptive reference only; no full-engine validation or adult-cow inference.",
    },
    {
        "id": "rothamsted-dairy-beef-grazing",
        "name": "Rothamsted dairy-cross beef grazing",
        "manifest": "data/rothamsted/manifest.json",
        "audit": "docs/evidence/rothamsted-adg-audit.json",
        "decisionRef": "docs/evidence/engine-adg-rothamsted-check.json",
        "access": "available_local",
        "license": "CC BY 4.0 (manifest)",
        "reportedFacts": {
            "animals": _fact(248, definition="unique official tags", reference="docs/evidence/rothamsted-adg-audit.json#/integrity/uniqueOfficialTagCount"),
            "animalObservationUnits": _fact(2362, definition="animal-period rows", reference="docs/evidence/rothamsted-adg-audit.json#/integrity/animalPeriodRowCount"),
        },
        "population": "Young growing dairy-cross beef cattle in temperate pasture; not a mature-cow cohort.",
        "units": "Animal-period daily liveweight gain kg/steer/day; repeated periods per official tag.",
        "missingness": "Integrity, coverage and cohort details are in the linked audit report.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No individual DMI outcome is present."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Open repeated animal-period ADG supports a bounded component diagnostic, but its population and predictors differ from the approved CPER case."},
        "permissibleUse": "Held-out cohort ADG component diagnostic only; not full-engine or adult-cow validation.",
    },
    {
        "id": "mdpi-angus-cows",
        "name": "Angus cows on dormant-season rangeland",
        "manifest": "data/mdpi-angus-cow-grazing/manifest.json",
        "audit": "docs/evidence/mdpi-angus-cow-grazing-audit.json",
        "decisionRef": "docs/evidence/mdpi-angus-cow-grazing-audit.json",
        "access": "available_local",
        "license": "CC-BY-4.0 (manifest/article supplement; inspect data terms before redistribution)",
        "reportedFacts": {
            "animals": _fact(241, definition="unique cow IDs across the two study years", reference="docs/evidence/mdpi-angus-cow-grazing-audit.json#/coverage/s1UniqueCowIdsAcrossYears"),
            "animalObservationUnits": _fact(408, definition="cow-season rows", reference="docs/evidence/mdpi-angus-cow-grazing-audit.json#/coverage/s1CowSeasonRows"),
            "missingness": _fact({"weightChange": 5, "bodyConditionScoreChange": 3}, definition="rows missing weight-change and BCS-change values", reference="docs/evidence/mdpi-angus-cow-grazing-audit.json#/coverage/s1MissingWeightChange"),
        },
        "population": "Pregnant commercial Angus cows, ages 1–10, on dormant mixed-grass rangeland.",
        "units": "Cow-season weight change; ADG is derived over a study-reported 84-day period.",
        "missingness": "Audit reports missing weight/BCS changes; 167 cow IDs recur across years, and GPS covers a subset/45 days.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "Total forage DMI is not observed; supplement intake is not total DMI."},
        "adg": {"status": "conditional", "trainable": True, "reason": "Derived period weight change can serve as a descriptive cow-season reference, not verified daily ADG or an engine prediction target."},
        "permissibleUse": "Descriptive period-change reference with year+animal grouping and missingness disclosure.",
    },
    {
        "id": "public-pasture-dmi-unavailable",
        "name": "Public pasture DMI candidates with no reusable individual records found",
        "manifest": None,
        "audit": "docs/evidence/public-pasture-dmi-source-triage-2026-10.json",
        "decisionRef": "docs/evidence/public-pasture-dmi-source-triage-2026-10.json",
        "access": "unavailable_or_not_reusable",
        "license": "Underlying-data reuse license/access not established for the cited candidates.",
        "population": "Candidate sources include adult beef cattle on pasture; assess each source separately if access/terms change.",
        "units": "No individual-level reusable outcome file was retrieved for these candidates.",
        "missingness": "Individual observations are unavailable; article summaries are not a substitute.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "Underlying records are private, inaccessible, absent, or not data-specifically licensed; inaccessible sources are never counted as trainable."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "No usable individual ADG records with the required paired inputs were retrieved."},
        "permissibleUse": "Literature/methods context and access follow-up only; do not reconstruct microdata from tables or figures.",
    },
]

# Keep each candidate from the existing pasture-DMI triage visible as its own
# evaluated source. The shared audit path is paired with the source JSON
# Pointer so citations and eligibility decisions remain attributable.
SOURCES = [source for source in SOURCES if source["id"] != "public-pasture-dmi-unavailable"]
TRIAGE_PATH = "docs/evidence/public-pasture-dmi-source-triage-2026-10.json"
TRIAGE_CANDIDATES = [
    {
        "id": "pasture-dmi-triage-8262715", "doi": "10.21203/rs.3.rs-8262715/v1",
        "name": "Statistical Methodologies for Prediction of Beef Cattle Pasture DMI",
        "license": "CC BY 4.0 article license; individual records are confidential and not licensed for reuse.",
        "population": "881 animals from 38 Brazilian studies; reported holdout is study-level.",
        "units": "No reusable individual outcomes; article-level metrics are not source records.",
        "dmiReason": "Data availability statement identifies confidential private records; the article license does not cover underlying observations.",
        "adgReason": "No reusable individual ADG records or paired input rows were retrieved.",
        "use": "Methods/literature context only; do not reconstruct records from tables or figures.",
    },
    {
        "id": "pasture-dmi-triage-etd-13250", "doi": "10.33915/etd.13250",
        "name": "Differences in DMI in Grazing and Drylot Beef Cattle",
        "license": "No separate open-data license for underlying data found on repository record.",
        "population": "163 beef cattle across four experimental groups and two grazing seasons.",
        "units": "No openly licensed individual DMI records retrieved; pasture DMI described as LSTM-estimated.",
        "dmiReason": "No openly licensed individual file; the pasture target described in the abstract is model-estimated rather than directly measured.",
        "adgReason": "No reusable individual ADG records with paired predictors were retrieved.",
        "use": "Literature context only; do not score as independent pasture DMI validation.",
    },
    {
        "id": "pasture-dmi-triage-skab279", "doi": "10.1093/jas/skab279",
        "name": "Herbage mass, genotype, and intake of beef cows on native grassland",
        "license": "Open full-text article; no separate individual-data license located.",
        "population": "24–36 adult multiparous Hereford, Angus, and crossbred cows across eight paddocks and six periods.",
        "units": "Article-level intake estimated by n-alkane ratio; no reusable individual file retrieved.",
        "dmiReason": "No reusable individual file or data-specific reuse terms; do not reconstruct observations from tables or figures.",
        "adgReason": "Reported calf ADG is not the approved adult-cattle target; individual records were not retrieved.",
        "use": "Peer-reviewed methods and population reference only.",
    },
    {
        "id": "pasture-dmi-triage-livsci-2015", "doi": "10.1016/j.livsci.2015.01.020",
        "name": "Herbage Selection, Intake, and Digestibility in Grazing Beef Cattle",
        "license": "2015 Elsevier article copyright; no separate data-specific reuse license identified.",
        "population": "20 nonlactating Angus cows averaging 50 months of age grazing mixed pasture.",
        "units": "Article reports aggregate grazing herbage intake; no reusable per-cow total-DMI records retrieved.",
        "dmiReason": "The article describes individual herbage-intake estimates but no downloadable row-level file or data-specific reuse terms were located; herbage intake also does not document the specified total-DMI outcome including supplement.",
        "adgReason": "No reusable individual ADG records or paired inputs were retrieved.",
        "use": "Strong adult-cow population and method reference only; do not reconstruct microdata from reported aggregates.",
    },
    {
        "id": "pasture-dmi-triage-skaf429", "doi": "10.1093/jas/skaf429",
        "name": "Forage Intake and Digesta Kinetics of Lactating Beef Cattle on Idaho Rangelands",
        "license": "No data-specific reuse license for cow-level records identified; OSF example datasets/code are not study observations.",
        "population": "24 2-year-old lactating Angus × Hereford cows grazing Idaho rangeland in spring and summer periods.",
        "units": "Individual forage-intake estimates are described, but no public animal-period outcome file was retrieved.",
        "dmiReason": "The article links example datasets and SAS code, not the grazing-cohort records; no individual data file or reuse terms were identified.",
        "adgReason": "No reusable individual ADG outcome file and paired predictors were located.",
        "use": "Recent population/method reference only; exclude example model inputs from observed-outcome validation.",
    },
    {
        "id": "pasture-dmi-triage-teagasc-2019", "doi": "10.1017/S1751731119001241",
        "name": "Developing and Validating a Model for DMI of Grazing Lactating Beef Cows",
        "license": "Open-access article; no separate data license or public deposit for underlying cow-level records identified.",
        "population": "94 DMI measurements on 106 beef/beef-dairy crossbred cows, with model results also reported on a separate 60-cow lactating herd.",
        "units": "Published model results only; no downloadable individual DMI rows or animal/trial keys retrieved.",
        "dmiReason": "The institutional full-text and publisher abstract contain cohort metrics but no public microdata, row-level IDs, or data-specific reuse terms.",
        "adgReason": "No reusable individual ADG records and paired outcome inputs were retrieved.",
        "use": "Highly relevant methods/population reference only; published regression metrics cannot substitute for cow-level records.",
    },
    {
        "id": "pasture-dmi-triage-skag054", "doi": "10.1093/jas/skag054",
        "name": "Characterization of Individual Beef Cattle Water Intake",
        "license": "CC BY-NC-ND 4.0 article license does not license underlying individual records.",
        "population": "2,084 beef animals across two West Virginia sites, including grazing crossbred steers.",
        "units": "Article reports daily DMI, body weight, and water records; no downloadable individual file retrieved.",
        "dmiReason": "Publication summaries are not training records; data-specific reuse license and public deposit were not located.",
        "adgReason": "No reusable ADG file or paired pasture covariates were located.",
        "use": "Methods and cohort context only; revisit if a public data deposit and reuse terms appear.",
    },
    {
        "id": "pasture-dmi-triage-skag133", "doi": "10.1093/jas/skag133",
        "name": "Generalizable LSTM Models for Beef Cattle DMI Under Grazing",
        "license": "CC BY-NC-ND 4.0 article license; underlying data is available only by author inquiry.",
        "population": "Individual DMI, BW, water, and climate records across grazing/drylot cohorts, including West Virginia crossbred steers.",
        "units": "Article describes daily records and animal-grouped partitions; no public individual file retrieved.",
        "dmiReason": "Author-mediated access is not public reusable access; the article license does not license underlying records.",
        "adgReason": "No public individual ADG file and aligned inputs were retrieved.",
        "use": "Methods/benchmark context only; do not reproduce results from aggregate metrics as external validation.",
    },
    {
        "id": "pasture-dmi-triage-1770302", "doi": "10.3389/fanim.2026.1770302",
        "name": "Deployable DMI Prediction Using GPBoost, MLOps, and Flask",
        "license": "Open access article; no separate data license or dataset deposit identified.",
        "population": "Beef-cattle DMI cohorts; article reports animal-ID grouped train/validation/test partitions.",
        "units": "Article-level model metrics only; no individual data file retrieved.",
        "dmiReason": "No public individual-level dataset or data-specific reuse terms were identified.",
        "adgReason": "No individual ADG target file is publicly available in the reviewed source.",
        "use": "Peer-reviewed workflow/methods reference only; not external validation or calibration evidence.",
    },
    {
        "id": "pasture-dmi-triage-usda-mindy-28071860", "doi": "10.15482/USDA.ADC/28071860.v1",
        "name": "USDA MINDY Grazing-Scenario Model Outputs",
        "license": "CC BY 4.0 for deposited files; intake outputs are simulated scenario results, not observed animal records.",
        "population": "Pregnant beef-cow grazing-system scenario modelled across 25 management/feed scenarios.",
        "units": "Public scenario outputs include modelled DMI but no observed cow-period outcome labels.",
        "dmiReason": "DMI values are generated by the grazing-system model, not measured individual-animal outcomes; simulation outputs cannot serve as supervised field labels or independent validation.",
        "adgReason": "No reusable observed individual ADG records with paired field predictors were retrieved.",
        "use": "Reusable scenario/model-output context only; retain the simulated provenance and do not treat as observed animal data.",
    },
    {
        "id": "pasture-dmi-triage-figshare-28801181", "doi": "10.6084/m9.figshare.28801181.v2",
        "name": "Labeled Sensor Dataset of Beef Cattle Behavior on Desert Rangelands",
        "license": "CC BY 4.0 for deposited behavior/sensor files; this does not create an absent DMI outcome.",
        "population": "24 mature beef cows aged 4–9 years on desert rangelands, with per-animal sensor and minute-level behavior labels.",
        "units": "Animal/time-level behavior observations; no total-DMI outcome or measurement protocol.",
        "dmiReason": "The publicly reusable files label sensor and grazing behavior but contain no individual total-DMI outcome in kg DM/animal/day.",
        "adgReason": "No individual ADG outcome and paired predictors were identified in the behavior dataset.",
        "use": "Reusable behavior research only; do not infer DMI from behavior labels or treat them as intake measurements.",
    },
]
for candidate_index, candidate in enumerate(TRIAGE_CANDIDATES):
    SOURCES.append({
        "id": candidate["id"], "doi": candidate["doi"], "name": candidate["name"],
        "manifest": None, "audit": TRIAGE_PATH,
        "sourceAssessmentRef": f"{TRIAGE_PATH}#/sources/{candidate_index}",
        "decisionRef": TRIAGE_PATH,
        "access": "unavailable_or_not_reusable", "license": candidate["license"],
        "population": candidate["population"], "units": candidate["units"],
        "missingness": "Individual observations are unavailable; row-level missingness cannot be computed from the reviewed source.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": candidate["dmiReason"]},
        "adg": {"status": "ineligible", "trainable": False, "reason": candidate["adgReason"]},
        "permissibleUse": candidate["use"],
    })


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path.relative_to(ROOT)}")
    return value


def _read_source_reference(reference: str) -> dict[str, Any]:
    return read_json(ROOT / reference)


def _readiness_outcome(source: dict[str, Any], dimension: str) -> dict[str, Any]:
    declared = source[dimension]
    if declared["status"] not in {"eligible", "conditional", "ineligible"}:
        raise ValueError(f"Unknown status for {source['id']}.{dimension}")
    if not isinstance(declared.get("trainable"), bool):
        raise ValueError(f"Missing trainable decision for {source['id']}.{dimension}")

    status = declared["status"]
    trainable = declared["trainable"]
    reason = declared["reason"]
    access = source["access"]
    license_text = source.get("license")
    if access not in {"available_local", "unavailable_or_not_reusable"}:
        raise ValueError(f"Unknown access status for {source['id']}: {access}")
    if access != "available_local":
        status = "ineligible"
        trainable = False
        reason = f"{reason} Source is inaccessible or not reusable."
    if not isinstance(license_text, str) or not license_text.strip():
        status = "ineligible"
        trainable = False
        reason = f"{reason} Reuse license is absent or undocumented."
    if status == "ineligible" and trainable:
        raise ValueError(f"Ineligible source cannot be trainable: {source['id']}.{dimension}")
    if access != "available_local" and trainable:
        raise ValueError(f"Inaccessible source cannot be trainable: {source['id']}.{dimension}")
    return {"status": status, "trainable": trainable, "reason": reason}


def build_record(source: dict[str, Any], read_reference=_read_source_reference) -> dict[str, Any]:
    manifest_ref = source["manifest"]
    audit_ref = source["audit"]
    manifest = read_reference(manifest_ref) if manifest_ref else None
    audit = read_reference(audit_ref)
    reported = source.get("reportedFacts", {})

    result = {
        "id": source["id"],
        "name": source["name"],
        "references": {
            "manifest": manifest_ref,
            "audit": audit_ref,
            "decision": source["decisionRef"],
            "sourceAssessment": source.get("sourceAssessmentRef"),
        },
        "sourceIdentity": {
            "doi": source.get("doi") or find_doi(manifest or audit),
            "license": source.get("license"),
        },
        "access": source["access"],
        "studyDesign": reported.get("studyDesign", _fact()),
        "counts": {
            "animals": reported.get("animals", _fact()),
            "animalObservationUnits": reported.get("animalObservationUnits", _fact()),
            "trials": reported.get("trials", _fact()),
        },
        "population": source["population"],
        "units": source["units"],
        "missingness": {
            "summary": source["missingness"],
            "documentedMetrics": reported.get("missingness", _fact()),
        },
        "outcomes": {dimension: _readiness_outcome(source, dimension) for dimension in ("dmi", "adg")},
        "permissibleUse": source["permissibleUse"],
    }
    # Keep references demonstrably live; the detailed reports remain canonical.
    for ref in result["references"].values():
        if ref and not (ROOT / ref.split("#", 1)[0]).is_file():
            # Fixture readers may supply virtual references without writing any
            # source data into the repository.
            if read_reference is _read_source_reference:
                raise FileNotFoundError(f"Missing evidence reference: {ref}")
    for fact in [result["studyDesign"], *result["counts"].values(), result["missingness"]["documentedMetrics"]]:
        fact_ref = fact.get("reference")
        if fact_ref:
            read_reference(fact_ref.split("#", 1)[0])
    if manifest is not None and not manifest:
        raise ValueError(f"Empty manifest: {manifest_ref}")
    if not audit:
        raise ValueError(f"Empty audit report: {audit_ref}")
    return result


def build_readiness_report(
    sources: list[dict[str, Any]],
    read_reference=_read_source_reference,
    *,
    domain_expert_review: dict[str, Any],
    elapsed_seconds: float = 0.0,
    version: str = VERSION,
) -> dict[str, Any]:
    """Build an in-memory readiness document from supplied sources and evidence.

    Sorting by stable source ID makes output ordering independent of fixture or
    registry input order. Counts and missingness stay null unless explicitly
    supplied as source-documented facts.
    """
    ordered_sources = sorted(sources, key=lambda source: source["id"])
    records = [build_record(source, read_reference) for source in ordered_sources]
    input_paths = {
        reference.split("#", 1)[0]
        for record in records
        for reference in record["references"].values()
        if reference
    }
    for record in records:
        fact_refs = [record["studyDesign"], *record["counts"].values(), record["missingness"]["documentedMetrics"]]
        input_paths.update(fact["reference"].split("#", 1)[0] for fact in fact_refs if fact.get("reference"))
    document = {
        "schemaVersion": "riose.dmi-adg-readiness/v1",
        "version": version,
        "generator": "scripts/build_dmi_adg_readiness.py",
        "purpose": "Reference-only readiness assessment for DMI and ADG component datasets.",
        "domainExpertReview": domain_expert_review,
        "sources": records,
        "processing": {
            "sourceCount": len(records),
            "inputFileCount": len(input_paths),
            "elapsedSeconds": round(elapsed_seconds, 6),
            "elapsedTimeKind": "observed_wall_clock_seconds",
        },
    }
    validate_readiness_report(document)
    return document


def validate_readiness_report(document: dict[str, Any]) -> None:
    """Reject incomplete or internally contradictory readiness reports.

    The matrix is used as a gate for selecting model data, so validate the
    published contract after aggregation as well as validating each source
    while it is built. This intentionally checks structure and eligibility
    invariants without pretending to independently verify scientific claims.
    """
    if document.get("schemaVersion") != "riose.dmi-adg-readiness/v1":
        raise ValueError("Unsupported DMI/ADG readiness schema")
    sources = document.get("sources")
    if not isinstance(sources, list):
        raise ValueError("Readiness sources must be a list")
    identifiers = [source.get("id") for source in sources if isinstance(source, dict)]
    if len(identifiers) != len(sources) or any(not isinstance(value, str) or not value.strip() for value in identifiers):
        raise ValueError("Every readiness source must have a non-empty ID")
    if identifiers != sorted(identifiers) or len(set(identifiers)) != len(identifiers):
        raise ValueError("Readiness sources must be uniquely sorted by ID")

    for source in sources:
        source_id = source["id"]
        for field in ("name", "population", "units", "permissibleUse"):
            if not isinstance(source.get(field), str) or not source[field].strip():
                raise ValueError(f"Missing {field} for {source_id}")
        if source.get("access") not in {"available_local", "unavailable_or_not_reusable"}:
            raise ValueError(f"Unknown access status for {source_id}")
        source_identity = source.get("sourceIdentity")
        if not isinstance(source_identity, dict):
            raise ValueError(f"Missing source identity for {source_id}")
        license_text = source_identity.get("license")
        has_license = isinstance(license_text, str) and bool(license_text.strip())
        outcomes = source.get("outcomes")
        if not isinstance(outcomes, dict):
            raise ValueError(f"Missing outcomes for {source_id}")
        for dimension in ("dmi", "adg"):
            outcome = outcomes.get(dimension)
            if not isinstance(outcome, dict):
                raise ValueError(f"Missing {dimension} outcome for {source_id}")
            status = outcome.get("status")
            if status not in {"eligible", "conditional", "ineligible"}:
                raise ValueError(f"Unknown {dimension} status for {source_id}")
            if not isinstance(outcome.get("trainable"), bool):
                raise ValueError(f"Missing {dimension} trainable decision for {source_id}")
            if not isinstance(outcome.get("reason"), str) or not outcome["reason"].strip():
                raise ValueError(f"Missing {dimension} decision reason for {source_id}")
            if status == "ineligible" and outcome["trainable"]:
                raise ValueError(f"Ineligible outcome cannot be trainable: {source_id}.{dimension}")
            if outcome["trainable"] and source["access"] != "available_local":
                raise ValueError(f"Unavailable source cannot be trainable: {source_id}.{dimension}")
            if outcome["trainable"] and not has_license:
                raise ValueError(f"Unlicensed source cannot be trainable: {source_id}.{dimension}")

    processing = document.get("processing")
    if not isinstance(processing, dict) or processing.get("sourceCount") != len(sources):
        raise ValueError("Processing sourceCount does not match the readiness matrix")
    if type(processing.get("inputFileCount")) is not int or processing["inputFileCount"] < 0:
        raise ValueError("Invalid processing inputFileCount")
    elapsed = processing.get("elapsedSeconds")
    if type(elapsed) not in {int, float} or elapsed < 0:
        raise ValueError("Invalid processing elapsedSeconds")

    review = document.get("domainExpertReview")
    if not isinstance(review, dict) or any(
        not isinstance(review.get(field), str) or not review[field].strip()
        for field in ("status", "statement", "reference", "attributionNote")
    ):
        raise ValueError("Domain expert review must retain status, evidence, and attribution")


def find_doi(value: Any) -> str | None:
    if isinstance(value, dict):
        for key in ("doi", "datasetDoi", "articleDoi", "article_doi"):
            found = value.get(key)
            if isinstance(found, str) and found:
                return found
        for child in value.values():
            found = find_doi(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_doi(child)
            if found:
                return found
    return None


def render_markdown(document: dict[str, Any]) -> str:
    def fact_text(fact: dict[str, Any]) -> str:
        value = fact.get("value")
        if value is None:
            return "unknown"
        rendered = json.dumps(value, ensure_ascii=False, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
        definition = fact.get("definition")
        reference = fact.get("reference")
        if definition:
            rendered += f" ({definition})"
        if reference:
            rendered += f" [{reference}]"
        return rendered

    lines = [
        f"# Matriz de prontidão DMI/ADG v{document['version']}",
        "",
        "Agregação determinística de manifestos e relatórios de auditoria existentes. Este índice referencia evidências; não replica linhas de dados. `trainable` indica elegibilidade de registros para treino dentro do escopo local indicado, não que houve treino.",
        "",
        f"**Processamento:** `sourceCount` = {document['processing']['sourceCount']}; `inputFileCount` = {document['processing']['inputFileCount']}; `elapsedSeconds` = {document['processing']['elapsedSeconds']:.6f} s (tempo observado).",
        "",
        "## Matriz",
        "",
        "| Fonte | Acesso | Desenho documentado | Animais documentados | Trials documentados | DMI | ADG | População / unidade | Uso admissível | Evidências |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for item in document["sources"]:
        dmi = item["outcomes"]["dmi"]
        adg = item["outcomes"]["adg"]
        refs = item["references"]
        source_refs = ", ".join(f"`{key}: {value}`" for key, value in refs.items() if value)
        compact = f"{item['population']} {item['units']}"
        lines.append(
            f"| {item['name']} | {item['access']} | {fact_text(item['studyDesign'])} | "
            f"{fact_text(item['counts']['animals'])} | {fact_text(item['counts']['trials'])} | "
            f"{dmi['status']} (trainable: {str(dmi['trainable']).lower()}) | "
            f"{adg['status']} (trainable: {str(adg['trainable']).lower()}) | {compact} | {item['permissibleUse']} | {source_refs} |"
        )
        lines.append("")
        lines.append(f"**{item['id']} — razões.** DMI: {dmi['reason']} ADG: {adg['reason']}")
        lines.append(f"**Licença:** {item['sourceIdentity']['license'] or 'unknown'} **Unidades animal-período/registro:** {fact_text(item['counts']['animalObservationUnits'])}")
        lines.append(f"**Missingness:** {item['missingness']['summary']} **Métricas documentadas:** {fact_text(item['missingness']['documentedMetrics'])}")
        lines.append("")
    review = document["domainExpertReview"]
    lines.extend([
        "## Parecer especializado",
        "",
        f"**Estado:** {review['status']}. {review['statement']}",
        f"**Atribuição/evidência:** `{review['reference']}`. {review['attributionNote']}",
        "",
        "## Escopo e cautelas",
        "",
        "- A disponibilidade de um manifesto não basta: o status e a licença são avaliados separadamente do escopo biológico e da qualidade do outcome.",
        "- Fontes sem arquivo individual reutilizável e termos de uso estabelecidos têm `trainable: false`, mesmo quando o artigo tem licença aberta.",
        "- `eligible`/`conditional` são específicos ao componente DMI ou ADG e ao uso descrito; não autorizam alegações de validade completa do motor, causalidade ou transferência populacional.",
        "- Esta matriz não substitui a issue #22 e não altera a trilha observacional aprovada em #1/#6.",
        "",
        "## Processamento",
        "",
        f"`sourceCount` = {document['processing']['sourceCount']}; `inputFileCount` = {document['processing']['inputFileCount']}; `elapsedSeconds` = {document['processing']['elapsedSeconds']:.6f} s.",
        "",
        f"Gerado pelo script `{document['generator']}`; versão do schema: `{document['schemaVersion']}`.",
        "",
    ])
    return "\n".join(lines)


DOMAIN_EXPERT_REVIEW = {
            "status": "pending_not_obtained",
            "statement": "Nenhum parecer zootécnico independente foi realizado; a classificação de yearlings como adultos permanece pendente.",
            "reference": "docs/caso-zootecnico-demonstrativo.md",
            "attributionNote": "A definição da pergunta exploratória foi aprovada pelo responsável do projeto; isso não é parecer de especialista. A issue #22 acompanha a revisão independente.",
}


def main() -> None:
    started = perf_counter()
    document = build_readiness_report(SOURCES, domain_expert_review=DOMAIN_EXPERT_REVIEW)
    document["processing"]["elapsedSeconds"] = round(perf_counter() - started, 6)
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MARKDOWN_OUTPUT.write_text(render_markdown(document), encoding="utf-8")


if __name__ == "__main__":
    main()
