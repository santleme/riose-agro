#!/usr/bin/env python3
"""Build a deterministic, reference-only DMI/ADG data-readiness matrix.

The source registry below records decisions and paths; source rows and raw
measurements stay in their existing manifests and audit reports. Re-run with
``python3 scripts/build_dmi_adg_readiness.py`` to refresh the versioned JSON
and Markdown artifacts.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from time import perf_counter
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.1.0"
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
        "decisionRef": "docs/evidence/issue-15-dryad-yearling-eligibility.json",
        "access": "available_local",
        "license": "CC0-1.0 (manifest)",
        "reportedFacts": {
            "studyDesign": _fact("Four independent experiments are described in the paper, but the row-level model file has no experiment/site/year grouping key", definition="primary-source design and model-file grouping audit", reference="docs/evidence/issue-15-dryad-yearling-eligibility.json#/populationAndDesign/groupingEvidence"),
            "animals": _fact(154, definition="unique model steer IDs", reference="docs/evidence/dryad-grazing-yearlings-audit.json#/coverage/uniqueModelSteerIds"),
            "animalObservationUnits": _fact(154, definition="model rows with ADG and body weight", reference="docs/evidence/dryad-grazing-yearlings-audit.json#/coverage/modelRowsWithAdgAndBw"),
            "trials": _fact(4, definition="independent experiments reported by the paper; individual rows cannot be assigned to these groups", reference="docs/evidence/issue-15-dryad-yearling-eligibility.json#/populationAndDesign/independentExperimentsInPrimarySource"),
        },
        "population": "Yearling grazing steers.",
        "units": "One ADG (kg/day) and body-weight (kg) record per steer; gas visits are repeated interval summaries, not repeated ADG.",
        "missingness": "The 154-row model file has no DMI, animal-specific initial/final weights and elapsed days, engine-aligned inputs, or experiment/site/year key. Repeated gas records do not supply these ADG fields.",
        "dmi": {"status": "ineligible", "trainable": False, "reason": "No DMI outcome is present."},
        "adg": {"status": "ineligible", "trainable": False, "reason": "Observed ADG and BW support descriptive cohort statistics only; model-ready paired engine inputs/outcome horizon and row-level experiment/site/year groups are absent, so this source cannot train or evaluate the current engine or support a grouped holdout."},
        "permissibleUse": "Separate descriptive yearling-steer ADG/BW cohort reference only; not a training or engine-validation source, not DMI evidence, and not adult-cow inference.",
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

# Supplementary readiness for science modules outside the DMI/ADG row schema.
# Keeping this as an optional top-level collection preserves consumers of the
# original `sources[].outcomes.{dmi,adg}` contract while making the new public
# cohorts visible in the same deterministic issue #96 report.
COMPONENT_ASSESSMENTS: list[dict[str, Any]] = [
    {
        "id": "dryad-mob-rotational-biomass",
        "module": "forage_biomass",
        "decision": "CONDITIONAL",
        "source": {
            "doi": "10.5061/dryad.79cnp5ht4",
            "manifest": "data/dryad-mob-rotational-biomass/manifest.json",
            "audit": "docs/evidence/dryad-mob-rotational-biomass-quality-2026-10.json",
            "access": "public_anonymous_downloaded_and_checksums_verified",
            "license": "CC0-1.0 (Dryad API record)",
        },
        "population": "Cool-season grass-legume pasture grazed by yearling beef cattle at one northeastern-US research farm; no animals are observed in this file.",
        "target": "Pre-grazing forage mass (PGFM), kg/ha; paddock-time mean over available quadrats, paired with paddock-level pre-grazing height in cm.",
        "groups": ["treatment", "replicate_paddock"],
        "repeatedDimensions": ["calendar_year", "julian_day"],
        "metrics": {
            "datasetRows": 64,
            "independentGroups": 8,
            "missingTargetSourceSlots": 17,
            "selectedModel": "height-only OLS selected on 13-fold 100 m-buffered Mendeley development CV",
            "externalRows": 64,
            "externalMaeKgDmHa": 2507.1157652653906,
            "externalRmseKgDmHa": 2986.389260697643,
            "externalBiasPredictedMinusObservedKgDmHa": 2094.7279551697575,
            "inSupportRows": 40,
            "inSupportMaeKgDmHa": 1659.2452528855429,
            "aboveSupportRows": 24,
            "aboveSupportMaeKgDmHa": 3920.23328589847,
            "modelEvaluation": "completed single-cohort external evaluation; not calibration or broad validation",
        },
        "limitations": [
            "Only eight paddocks recur over time; every split must preserve paddock groups.",
            "Biomass and height are aligned only after the documented paddock-time aggregation.",
            "The Mendeley sampling-point target and Dryad paddock-time quadrat mean are not identical sampling estimands.",
            "All 24 above-Mendeley-height-support rows are MOB treatment; support status is confounded with management, so the large above-support error cannot be attributed to extrapolation alone.",
            "The external bias is strongly positive even within height support; overall MAE is 2507.1 kg DM/ha and in-support MAE is 1659.2 kg DM/ha.",
            "Temperate US pasture does not validate Brazilian tropical pasture predictions.",
            "Not animal DMI, ADG, or full-engine evidence.",
        ],
        "references": [
            "data/dryad-mob-rotational-biomass/manifest.json",
            "docs/evidence/dryad-mob-rotational-biomass-quality-2026-10.json",
            "experiments/biomass/dryad-external/evaluation-report.json",
        ],
    },
    {
        "id": "perea-rangeland-behavior",
        "module": "behavior_classification",
        "decision": "ELIGIBLE",
        "source": {
            "doi": "10.6084/m9.figshare.28801181.v2",
            "audit": "docs/evidence/perea-rangeland-behavior-audit.json",
            "evaluation": "docs/evidence/perea-behavior-grouped-evaluation.json",
            "access": "public_downloaded_local",
            "license": "CC BY 4.0",
        },
        "population": "24 beef cattle across four breeds at two New Mexico ranches; sampled daylight sessions in summer/fall 2022.",
        "target": "Human-reviewed minute-level behavior class (GR, RE, RU, WA) from a single motion-index predictor; 8,864 analysis rows after the predeclared duplicate/conflicting-label policy.",
        "groups": ["breed", "animal_id"],
        "repeatedDimensions": ["animal_minute", "sampled_session"],
        "metrics": {
            "evaluation": "nested animal-grouped diagnostic; six outer folds, no animal overlap",
            "nestedRows": 5582,
            "nestedAnimalsInOuterFolds": 24,
            "selectedCandidatesAcrossOuterFolds": {"cart_depth_4": 4, "temporal_logistic_c_10": 2},
            "nestedEqualAnimalMeanF1_RE_RU": 0.4025871778670964,
            "nestedEqualAnimalMacroF1": 0.665958419440892,
            "nestedEqualAnimalRecall_RE": 0.3081198933322601,
            "nestedEqualAnimalRecall_RU": 0.7265047037876734,
            "nestedObservationWeightedAccuracy": 0.813686850591186,
            "modelEvaluation": "nested within-source exploratory evaluation; not external validation",
        },
        "previousStaticGroupedOof": {
            "sourceReport": "docs/evidence/perea-behavior-grouped-evaluation.json",
            "rows": 8864,
            "model": "single motion-index multinomial logistic regression",
            "equalAnimalAccuracy": 0.741130619912341,
            "equalAnimalBalancedAccuracy": 0.7200270840148827,
            "equalAnimalMacroF1": 0.6642230410345241,
            "restingRecall": 0.25444948829835656,
            "interpretation": "prior static grouped-OOF diagnostic; these values are not metrics for the nested-selected model",
        },
        "limitations": [
            "Breed is perfectly confounded with ranch/site in the documented source structure.",
            "RE recall is low; the main confusion is resting versus ruminating.",
            "Nested OOF results are exploratory within this source and reuse both ranches across outer folds; they do not establish performance at a new ranch.",
            "Sampled sessions do not represent full-day activity budgets or whole-season behavior.",
            "Behavior classification does not validate DMI consumption, ADG, BR-CORTE, or the full Riose engine.",
        ],
        "references": [
            "docs/evidence/perea-rangeland-behavior-audit.json",
            "docs/evidence/perea-behavior-grouped-evaluation.json",
            "docs/evidence/perea-behavior-oof-diagnostic.json",
            "experiments/diagnostics/behavior/preregister-perea-nested-animal-evaluation-2026-10.json",
            "experiments/behavior/perea-nested-animal/results.json",
        ],
    },
    {
        "id": "xgain-cattle-hourly-behavior",
        "module": "behavior_descriptive_profiles",
        "decision": "CONDITIONAL",
        "source": {
            "doi": "10.5281/zenodo.15600573",
            "manifest": "data/xgain-cattle-behavior/manifest.json",
            "quality": "docs/evidence/xgain-hourly-behavior-quality-2026-10.json",
            "access": "public_anonymous_downloaded_and_md5_verified",
            "license": "Zenodo metadata says CC BY 4.0; embedded README says CC BY-NC (conflict)",
            "reuseStatus": "not cleared for commercial training",
        },
        "population": "10 adult lactating Holstein cows with pasture access at ILVO, Belgium.",
        "target": "Hourly counts of one-minute classifier outputs for grazing, ruminating, resting, and other activity; not human reference labels.",
        "groups": ["animal_id"],
        "repeatedDimensions": ["hour", "calendar_day"],
        "metrics": {
            "records": 5760,
            "animals": 10,
            "hoursPerAnimal": 576,
            "missingValues": 0,
            "duplicateAnimalHourKeys": 0,
            "predictiveMetrics": "not_available; no independent human reference outcomes in archive",
        },
        "limitations": [
            "The released outcomes are decision-tree predictions; raw IMU and human-reference labels are absent.",
            "License conflict means commercial training is not cleared.",
            "Source time zone is unspecified; preserve timestamps as naive local time.",
            "Descriptive profiles and ingestion tests only; no classifier validation, DMI, or ADG assessment.",
        ],
        "references": [
            "data/xgain-cattle-behavior/manifest.json",
            "docs/evidence/xgain-hourly-behavior-quality-2026-10.json",
        ],
    },
    {
        "id": "usda-cper-ltgi-internal-adg",
        "module": "adg_internal_development",
        "decision": "CONDITIONAL",
        "source": {
            "doi": "10.15482/USDA.ADC/1528520",
            "audit": "docs/evidence/usda-cper-ltgi-audit.json",
            "evaluation": "experiments/diagnostics/adg/cper-internal-cv-2026-10.json",
            "protocol": "experiments/diagnostics/adg/preregister-cper-internal-cv-2026-10.json",
            "access": "public_local",
            "license": "U.S. Public Domain",
        },
        "population": "CPER yearling steers, development years 2009–2013; 320 rows before and 302 after identity-proxy purge for fold training, with 320 OOF rows scored.",
        "target": "Endpoint ADG = (final weight - initial weight) / grazing days, kg/head/day.",
        "groups": ["year", "owner_tag_color_tag_identity_proxy"],
        "repeatedDimensions": ["animal_identity_across_years"],
        "metrics": {
            "evaluation": "leave-one-year-out internal development CV with matching identity proxies purged from training",
            "oofRows": 320,
            "referenceCandidate": "M0 fold-training mean",
            "M0PooledMaeKgHeadDay": 0.22092262449947703,
            "M0PooledRmseKgHeadDay": 0.29833995811165487,
            "M0PooledBiasPredictedMinusObservedKgHeadDay": 0.0013676331085086392,
            "selectedCandidate": None,
            "anyCandidatePassedAdvancementRule": False,
        },
        "limitations": [
            "This is internal CPER development evidence, not external transport or a final holdout.",
            "Only five year blocks; nominal confidence or prediction-interval coverage is not justified.",
            "One remaining pasture replicate per treatment; engine inputs omit observed forage, weather, breed, and supplementation.",
            "Yearling-steer ADG does not validate adult-cow DMI or the full engine.",
        ],
        "references": [
            "docs/evidence/usda-cper-ltgi-audit.json",
            "experiments/diagnostics/adg/preregister-cper-internal-cv-2026-10.json",
            "experiments/diagnostics/adg/cper-internal-cv-2026-10.json",
        ],
    },
    {
        "id": "precision-beef-90s-instrument-agreement",
        "module": "behavior_instrument_agreement",
        "decision": "CONDITIONAL",
        "source": {
            "doi": "10.5281/zenodo.4064802",
            "manifest": "data/precision-beef/manifest.json",
            "processingReport": "data/precision-beef/processing-report-90s.json",
            "alignmentAudit": "data/precision-beef/alignment-audit.json",
            "evaluation": "experiments/behavior/precision-beef-instrument-agreement/results-90s.json",
            "access": "public_downloaded_checksums_verified",
            "license": "CC BY 4.0",
        },
        "population": "18 housed finishing beef steers in the Precision Beef source cohort; source split holds animals 04, 10, and 11 for test.",
        "target": "90-second majority behavior class inferred from the RumiWatch halter; collar accelerometer summary features predict instrument-derived labels.",
        "groups": ["animal_id", "farm_trial_id"],
        "repeatedDimensions": ["90_second_window", "animal"],
        "metrics": {
            "sourceFilesDownloadedAndChecksummed": 37,
            "processedParquets": 18,
            "unionWindows": 138453,
            "eligibleWindows": 138118,
            "scoringRule": "Exclude partial boundary windows, tied/invalid labels, nonfinite collar features, and either-stream counts below 800 of 900 nominal samples.",
            "developmentAnimals": 15,
            "developmentLeaveOneAnimalOutMacroF1": 0.6561634775497532,
            "sourceTestAnimals": ["04", "10", "11"],
            "sourceTestRows": 18866,
            "sourceTestRandomForestMacroF1": 0.6558422947305994,
            "sourceTestRandomForestBalancedAccuracy": 0.7125059032164268,
            "sourceTestRandomForestAccuracy": 0.6755539064984628,
            "sourceTestMajorityBaselineMacroF1": 0.21990148716491428,
            "sourceTestMajorityBaselineAccuracy": 0.49220820523693415,
            "modelEvaluation": "reproducible instrument-agreement diagnostic on the source-provided animal split; test animals have appeared in the associated publication and are not an independent literature-level holdout",
        },
        "limitations": [
            "The prediction target is a RumiWatch instrument-derived majority label, not video-confirmed human ground truth.",
            "The primary paper states time alignment was verified but does not specify row pairing or clock-offset corrections; processing uses README-anchored shared wall-clock bins and must not be interpreted as proof of exact synchronization.",
            "The cohort consists of housed finishing steers; it does not evaluate grazing behavior or transport to farms/ranches.",
            "This behavior result does not measure DMI or ADG and does not validate BR-CORTE or the Riose engine.",
            "Animals 04, 10, and 11 are the source-provided test split, not a newly collected or literature-independent holdout.",
        ],
        "references": [
            "data/precision-beef/manifest.json",
            "data/precision-beef/alignment-audit.json",
            "data/precision-beef/processing-report-90s.json",
            "experiments/behavior/precision-beef-instrument-agreement/amendment-2026-10-13.md",
            "experiments/behavior/precision-beef-instrument-agreement/results-90s.json",
        ],
    },
    {
        "id": "usda-cper-cgrec-adg-transport",
        "module": "adg_transport_diagnostic",
        "decision": "CONDITIONAL",
        "source": {
            "doi": "10.15482/USDA.ADC/1524719",
            "audit": "docs/evidence/usda-cgrec-longterm-audit.json",
            "evaluation": "docs/evidence/engine-adg-usda-cgrec-transport-check.json",
            "access": "public_local",
            "license": "U.S. Public Domain",
        },
        "population": "291 eligible yearling steers at CGREC, North Dakota; years 1989, 1994, and 2015.",
        "target": "Observed endpoint ADG = (final weight - initial weight) / ADG_DAYS, kg/head/day.",
        "groups": ["animal_tag", "year", "pasture"],
        "repeatedDimensions": ["not_applicable_to_eligible_steer_rows"],
        "metrics": {
            "evaluation": "historical external-site transport diagnostic; already consulted, not a fresh final holdout",
            "defaultEngineMaeKgHeadDay": 0.5396938859151102,
            "cperScaledEngineMaeKgHeadDay": 0.2221192500940076,
            "calibratedOnCgrec": False,
            "modelSelectionAllowed": False,
        },
        "limitations": [
            "The CPER scale used for comparison was fitted on CPER development data; the CGREC data have already been consulted.",
            "Engine runs used illustrative pasture settings without observed forage, weather, or supplementation inputs.",
            "Yearling steers do not establish adult-cow performance or mature-cow DMI validity.",
            "This is an ADG component diagnostic only, not full-engine validation.",
        ],
        "references": [
            "docs/evidence/usda-cgrec-longterm-audit.json",
            "docs/evidence/engine-adg-usda-cgrec-transport-check.json",
        ],
    },
    {
        "id": "adult-beef-cow-pasture-total-dmi-gate",
        "module": "adult_beef_cow_pasture_total_dmi",
        "decision": "NO_GO",
        "source": {
            "doi": None,
            "audit": "docs/evidence/dmi-baseline-no-go-2026-10.json",
            "candidateTriage": "docs/evidence/open-scientific-data-discovery-2026-10.md",
            "access": "no qualifying public row-level cohort obtained",
            "license": "no qualifying source with applicable reuse rights",
        },
        "population": "Target is mature beef cows grazing pasture; no candidate currently passes the complete gate.",
        "target": "Individual total DMI, measured or scientifically eligible estimate, kg DM/animal/day; forage plus supplement where applicable.",
        "groups": ["animal_id", "trial_or_herd", "farm_or_site"],
        "repeatedDimensions": ["animal_period"],
        "metrics": {
            "eligibleCohorts": 0,
            "decision": "NO_GO; no training or validation permitted for the original target",
            "basis": "No source simultaneously has retrieved records, compatible target/population, known units, group keys, reusable license, and defensible independent evaluation.",
        },
        "limitations": [
            "Open article access is not evidence that underlying individual data are public or reusable.",
            "Dairy, yearling, feedlot, estimated non-total DMI, aggregate-only, and simulated cohorts do not satisfy this target.",
            "BR-CORTE 2023 Eq. 2.6 remains available for conditional scenarios in its published growing-Zebu supplemented-pasture domain when ADG is supplied; it does not establish adult-cow individual-DMI accuracy.",
            "This does not prevent equation-based simulation or progress on separate biomass, behavior, or ADG modules.",
        ],
        "references": [
            "docs/evidence/dmi-baseline-no-go-2026-10.json",
            "docs/evidence/open-scientific-data-discovery-2026-10.md",
            "docs/evidence/br-corte-pasture-dmi-domain-audit-2026-10.md",
        ],
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
    {
        "id": "pasture-dmi-triage-ancp-nellore-1539056", "doi": "10.3389/fgene.2025.1539056",
        "name": "Nellore Feed-Efficiency GWAS Using ANCP Records",
        "license": "Open-access article; underlying ANCP records are private and no data-specific reuse terms were identified.",
        "population": "23,170 Nellore young bulls and heifers from 301 feed-efficiency trials; pasture-based raising is reported, but these are not established mature beef cows.",
        "units": "Automated DMI measurements in group-pen TMR trials; no public individual file retrieved.",
        "dmiReason": "Underlying ANCP observations are not publicly released, formal permission is required, and pen-based TMR intake does not match pasture field DMI for mature cows.",
        "adgReason": "No public reusable mature-cow pasture ADG records and paired predictors were retrieved.",
        "use": "Brazilian DMI research context only; do not treat young-bull/heifer TMR observations or article summaries as eligible pasture-cow labels.",
    },
    {
        "id": "pasture-dmi-triage-teagasc-2019-williams", "doi": "10.1017/S1751731119001241",
        "name": "Teagasc Grazing-Cow DMI Model Study",
        "license": "Open-access article; no separate data license or public deposit for individual records was identified.",
        "population": "Calibration on 106 beef/beef-dairy crossbred cows and validation on 60 lactating beef cows in grazing herds.",
        "units": "Article reports 94 calibration DMI measurements; outcome could not be confirmed as total DMI, and animal-period rows were unavailable.",
        "dmiReason": "No underlying records or data-specific reuse terms were located, and total DMI including supplement is not established by the reviewed accessible materials.",
        "adgReason": "No public individual ADG file with paired eligible predictors was retrieved.",
        "use": "Relevant grazing-cow methods reference only; require source rows, outcome definition, and explicit data reuse terms before reconsideration.",
    },
    {
        "id": "pasture-dmi-triage-soares-2026-holstein-gyr", "doi": "10.1007/s11250-026-05169-5",
        "name": "Canopy Structure, DMI, and Performance of Holstein × Gyr Cows on Urochloa Pastures",
        "license": "Open-access article; underlying study records are available only on reasonable request, with no public file or data-specific reuse license identified.",
        "population": "Ten lactating Holstein × Gyr dairy cows (five per treatment) in rotationally stocked Urochloa pastures; not mature beef cows.",
        "units": "Pasture DMI estimated per grazing cycle; cow fecal samples were pooled by cow within each evaluation period. No public individual rows retrieved.",
        "dmiReason": "Ineligible for the frozen target: dairy cows are outside the mature beef-cow population, the reported outcome is pasture DMI rather than total DMI including forage and supplement, and the underlying rows are available only on reasonable request.",
        "adgReason": "No individual ADG outcome file with paired eligible predictors was retrieved.",
        "use": "Relevant tropical pasture-dairy methods reference only; do not use as target training or validation, or infer individual records from article summaries.",
    },
    {
        "id": "pasture-dmi-triage-cabral-2012-pregnant-cows", "doi": "10.1590/S1516-35982012001200009",
        "name": "Levels of Supplementation for Grazing Pregnant Beef Cows During the Dry Season",
        "license": "The article is CC BY-NC 4.0; no public individual-record deposit or separate data-specific reuse terms were identified.",
        "population": "28 pregnant crossbred beef cows, predominantly Zebu, grazing Brachiaria decumbens in Viçosa, Brazil; four supplement treatments with seven replicates each. Age is not reported; parity was considered.",
        "units": "The study estimates individual pasture and supplement DMI, summed as total kg DM/animal/day over a marker-based digestibility period; only treatment-level means are published.",
        "dmiReason": "Population, pasture setting, and total-DMI outcome are relevant, but no cow-level source file, animal/trial keys, or data-specific reuse terms were found. Published treatment means are not individual training or validation rows.",
        "adgReason": "The article reports treatment-level weight-gain summaries, not reusable individual ADG rows with paired predictors.",
        "use": "Relevant Brazilian mature-cow pasture-DMI method reference only; request the underlying records and reuse terms before reconsideration, and do not reconstruct rows from aggregates.",
    },
    {
        "id": "pasture-dmi-triage-sowell-2003-beef-cows", "doi": "10.2527/2003.811294x",
        "name": "Liquid Supplement and Forage Intake by Range Beef Cows",
        "license": "USDA-hosted article copy carries © 2003 ASAS, all rights reserved; no public data deposit or data-specific reuse license was identified.",
        "population": "180 pregnant crossbred beef cows aged 2–6 years grazing native range across six pastures over two winters; individual forage and supplement intake components were estimated with markers.",
        "units": "Forage and supplement DMI summaries are reported separately by year/treatment and age; linked animal-level total-DMI rows and IDs are unavailable.",
        "dmiReason": "No reusable animal-level records, linked total-DMI rows, cow/pasture/year keys, or data-specific reuse terms were located. Published marginal summaries cannot be combined into individual outcomes; ages 4–6 and repeated animal identities would also need resolution.",
        "adgReason": "No reusable individual ADG records and paired inputs were retrieved.",
        "use": "Highly relevant U.S. mature beef-cow pasture-intake reference only; request deidentified linked rows and explicit reuse terms before reconsideration, and do not reconstruct rows from tables.",
    },
    {
        "id": "pasture-dmi-triage-nowakowski-2017", "doi": "10.5586/aa.1702",
        "name": "Estimation of Pasture Herbage Intake by Beef Cattle Based on n-Alkanes as Markers",
        "license": "CC BY article; no separate individual-data file or data-specific reuse terms were identified.",
        "population": "16 beef cows continuously grazing permanent pastures in Poland.",
        "units": "Marker-based pasture-herbage DMI estimates are reported in aggregate; total DMI including supplement and reusable cow-level rows/keys are unavailable.",
        "dmiReason": "No downloadable animal-level dataset or data-specific reuse terms were found, and total DMI including supplement is not established.",
        "adgReason": "No reusable individual ADG records and paired inputs were retrieved.",
        "use": "European beef-cow pasture measurement-method reference only; do not reconstruct individual rows from article summaries.",
    },
    {
        "id": "pasture-dmi-triage-pampa-corte-thesis-2024", "doi": None,
        "name": "Evaluation of Techniques and Markers for Intake Prediction in the Pampa Corte Model",
        "license": "AGRIS lists CC BY-NC-ND 4.0 for the thesis PDF; no separate animal-record dataset or data-specific reuse terms were identified.",
        "population": "46 beef cows in two native-pasture trials in Uruguay; thesis also contains growing-cattle trials in southern Brazil.",
        "units": "Cow outcome is forage organic-matter intake compared with Pampa Corte predictions, not total dry-matter intake including supplement; no separate row-level file located.",
        "dmiReason": "The outcome does not match total DMI and no separate reusable animal-level dataset was found; the thesis carries a no-derivatives license.",
        "adgReason": "Growing-cattle ADG data are outside the mature-cow population and the individual records have no separate dataset deposit identified.",
        "use": "Relevant Pampa Corte model-comparison context only; do not use as total-DMI training/validation or extract rows for this gate.",
    },
    {
        "id": "pasture-dmi-triage-cattlesat-2026", "doi": "10.3390/ani16111675",
        "name": "CattleSat Cow-Calf Grazing Decision-Support Model",
        "license": "CC BY 4.0 article; the article/supplement do not provide observed animal-level DMI records.",
        "population": "Modeled cow-calf grazing system using satellite-derived forage mass; the publication states that no human or animal subjects were used.",
        "units": "Mechanistically generated DMI outputs for a case-study simulation; no measured animal-period labels or animal/trial IDs.",
        "dmiReason": "The cow-pasture framing is not an observed cohort: DMI is generated by model equations, and the source states that no animals were used. Simulated outputs cannot serve as supervised field labels or independent validation.",
        "adgReason": "Modeled cow/calf performance outputs are not observed individual ADG records with paired field predictors.",
        "use": "Mechanistic and decision-support methods reference only; preserve its simulated provenance and do not treat outputs as observed animal data.",
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


def _resolve_json_pointer(document: Any, pointer: str, reference: str) -> Any:
    """Resolve a JSON Pointer so evidence citations cannot silently go stale."""
    if not pointer:
        return document
    if not pointer.startswith("/"):
        raise ValueError(f"Invalid JSON Pointer in evidence reference: {reference}")

    current = document
    for encoded_token in pointer[1:].split("/"):
        # RFC 6901 permits only ~0 and ~1 escapes. Reject malformed escapes
        # instead of accepting a citation that points somewhere unexpected.
        index = 0
        while index < len(encoded_token):
            if encoded_token[index] == "~":
                if index + 1 >= len(encoded_token) or encoded_token[index + 1] not in "01":
                    raise ValueError(f"Invalid JSON Pointer escape in evidence reference: {reference}")
                index += 2
            else:
                index += 1
        token = encoded_token.replace("~1", "/").replace("~0", "~")
        try:
            if isinstance(current, dict):
                current = current[token]
            elif isinstance(current, list):
                if token == "-" or not token.isdigit() or (len(token) > 1 and token.startswith("0")):
                    raise KeyError(token)
                current = current[int(token)]
            else:
                raise KeyError(token)
        except (KeyError, IndexError) as error:
            raise ValueError(f"Unresolved JSON Pointer in evidence reference: {reference}") from error
    return current


def _read_evidence_reference(reference: str, read_reference=_read_source_reference) -> Any:
    path, separator, pointer = reference.partition("#")
    document = read_reference(path)
    return _resolve_json_pointer(document, pointer, reference) if separator else document


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
            _read_evidence_reference(fact_ref, read_reference)
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
    component_assessments: list[dict[str, Any]] | None = None,
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
    # Fixture builders can omit the new collection and continue exercising the
    # legacy v1 source contract without needing unrelated evidence fixtures.
    selected_assessments = COMPONENT_ASSESSMENTS if component_assessments is None and read_reference is _read_source_reference else (component_assessments or [])
    component_assessments = sorted(selected_assessments, key=lambda assessment: assessment["id"])
    input_paths = {
        reference.split("#", 1)[0]
        for record in records
        for reference in record["references"].values()
        if reference
    }
    for record in records:
        fact_refs = [record["studyDesign"], *record["counts"].values(), record["missingness"]["documentedMetrics"]]
        input_paths.update(fact["reference"].split("#", 1)[0] for fact in fact_refs if fact.get("reference"))
    for assessment in component_assessments:
        input_paths.update(reference.split("#", 1)[0] for reference in assessment["references"])
    document = {
        "schemaVersion": "riose.dmi-adg-readiness/v1",
        "version": version,
        "generator": "scripts/build_dmi_adg_readiness.py",
        "purpose": "Reference-only readiness assessment for DMI/ADG datasets and separate scientific modules.",
        "domainExpertReview": domain_expert_review,
        "sources": records,
        "processing": {
            "sourceCount": len(records),
            "inputFileCount": len(input_paths),
            "elapsedSeconds": round(elapsed_seconds, 6),
            "elapsedTimeKind": "observed_wall_clock_seconds",
        },
    }
    if component_assessments:
        # Optional additive field: existing v1 consumers can continue reading
        # `sources` unchanged; newer consumers can read readiness for other
        # independently-scoped scientific modules here.
        document["componentAssessments"] = component_assessments
        document["processing"]["componentAssessmentCount"] = len(component_assessments)
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

    # This collection was added additively in v1.1. Older v1 reports without it
    # remain valid; when present, every assessment needs an explicit module
    # decision and the provenance fields required for a scientific gate.
    component_assessments = document.get("componentAssessments", [])
    if not isinstance(component_assessments, list):
        raise ValueError("componentAssessments must be a list when present")
    component_ids = [item.get("id") for item in component_assessments if isinstance(item, dict)]
    if len(component_ids) != len(component_assessments) or component_ids != sorted(component_ids) or len(set(component_ids)) != len(component_ids):
        raise ValueError("Component assessments must have unique sorted IDs")
    for item in component_assessments:
        for field in ("id", "module", "population", "target"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"Missing component assessment {field}")
        if item.get("decision") not in {"ELIGIBLE", "CONDITIONAL", "INELIGIBLE", "NO_GO"}:
            raise ValueError(f"Unknown component assessment decision: {item['id']}")
        source = item.get("source")
        if not isinstance(source, dict) or not isinstance(source.get("access"), str) or not source["access"].strip():
            raise ValueError(f"Missing component source access: {item['id']}")
        if not isinstance(source.get("license"), str) or not source["license"].strip():
            raise ValueError(f"Missing component source license: {item['id']}")
        if not isinstance(item.get("groups"), list) or not item["groups"]:
            raise ValueError(f"Missing component grouping keys: {item['id']}")
        if not isinstance(item.get("metrics"), dict) or not item["metrics"]:
            raise ValueError(f"Missing component metrics or explicit metric status: {item['id']}")
        if not isinstance(item.get("limitations"), list) or not item["limitations"]:
            raise ValueError(f"Missing component limitations: {item['id']}")
        refs = item.get("references")
        if not isinstance(refs, list) or not refs:
            raise ValueError(f"Missing component evidence references: {item['id']}")
        for reference in refs:
            if not isinstance(reference, str) or not reference.strip():
                raise ValueError(f"Invalid component evidence reference: {item['id']}")
            path, separator, pointer = reference.partition("#")
            if path.endswith(".json"):
                _read_evidence_reference(reference, _read_source_reference)
                if separator and not pointer.startswith("/"):
                    raise ValueError(f"Invalid component evidence pointer: {reference}")
            elif not (ROOT / path).is_file():
                raise FileNotFoundError(f"Missing component evidence reference: {reference}")

    processing = document.get("processing")
    if not isinstance(processing, dict) or processing.get("sourceCount") != len(sources):
        raise ValueError("Processing sourceCount does not match the readiness matrix")
    if type(processing.get("inputFileCount")) is not int or processing["inputFileCount"] < 0:
        raise ValueError("Invalid processing inputFileCount")
    if "componentAssessments" in document and processing.get("componentAssessmentCount") != len(component_assessments):
        raise ValueError("Processing componentAssessmentCount does not match the component matrix")
    elapsed = processing.get("elapsedSeconds")
    if type(elapsed) not in {int, float} or not math.isfinite(elapsed) or elapsed < 0:
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
        "## Prontidão de módulos científicos independentes",
        "",
        "Estas decisões complementam a matriz DMI/ADG sem misturar populações ou desfechos. `ELIGIBLE` e `CONDITIONAL` valem somente para o módulo e uso descritos; `NO_GO` mantém bloqueado o alvo original de DMI de vacas adultas a pasto.",
        "",
        "| Fonte | Módulo | Decisão | Acesso | Licença | População | Alvo / unidade | Grupos preservados | Métricas / avaliação | Limitações | Evidências |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ])
    for item in document.get("componentAssessments", []):
        source = item["source"]
        refs = ", ".join(f"`{reference}`" for reference in item["references"])
        metric_summary = json.dumps(item["metrics"], ensure_ascii=False, sort_keys=True)
        previous_static = item.get("previousStaticGroupedOof")
        if previous_static:
            metric_summary += " | previousStaticGroupedOof=" + json.dumps(previous_static, ensure_ascii=False, sort_keys=True)
        lines.append(
            f"| {item['id']} | {item['module']} | {item['decision']} | {source['access']} | {source['license']} | "
            f"{item['population']} | {item['target']} | {', '.join(item['groups'])} | "
            f"`{metric_summary}` | "
            f"{' '.join(item['limitations'])} | {refs} |"
        )
    lines.extend([
        "",
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
