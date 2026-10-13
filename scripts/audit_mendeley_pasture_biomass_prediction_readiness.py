#!/usr/bin/env python3
"""Create a biomass prediction-readiness audit and grouped OOF diagnostic."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import GroupKFold


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/mendeley-pasture-biomass"
PARQUET = DATA_DIR / "processed/pasture-biomass-samples-v1.parquet"
QUALITY_REPORT = DATA_DIR / "processed/quality-report-v1.json"
MANIFEST = DATA_DIR / "manifest.json"
OUTPUT_JSON = ROOT / "docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.json"
OUTPUT_MD = ROOT / "docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.md"
OUTPUT_OOF = ROOT / "docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv"
GROUP_KEYS = ["farm", "field_code", "pixel_id", "sampling_point_id"]
TARGET = "dry_matter_yield_kg_dm_ha"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def metric_summary(observed: pd.Series, predicted: pd.Series) -> dict[str, float | int]:
    return {
        "rows": int(len(observed)),
        "maeKgDmHa": float(mean_absolute_error(observed, predicted)),
        "rmseKgDmHa": float(np.sqrt(mean_squared_error(observed, predicted))),
        "biasPredictedMinusObservedKgDmHa": float((predicted - observed).mean()),
    }


def run_internal_grouped_oof(frame: pd.DataFrame) -> tuple[dict[str, Any], pd.DataFrame]:
    """Compare a training-fold median and one-feature linear model without group leakage."""
    complete = frame[[*GROUP_KEYS, "campaign", "sward_height_cm", TARGET]].dropna().copy()
    complete["spatial_group_id"] = complete[GROUP_KEYS].astype(str).agg("|".join, axis=1)
    if complete["spatial_group_id"].nunique() < 5:
        raise ValueError("at least five distinct spatial groups are required for 5-fold grouped OOF")

    features = complete[["sward_height_cm"]].astype(float)
    labels = complete[TARGET].astype(float)
    groups = complete["spatial_group_id"]
    splitter = GroupKFold(n_splits=5)
    predictions = pd.DataFrame(index=complete.index)
    predictions["spatial_group_id"] = groups
    predictions["farm"] = complete["farm"].astype(str)
    predictions["campaign"] = complete["campaign"].astype(str)
    predictions["sward_height_cm"] = complete["sward_height_cm"].astype(float)
    predictions["observed_dry_matter_yield_kg_dm_ha"] = labels
    predictions["fold"] = -1
    predictions["training_median_prediction_kg_dm_ha"] = np.nan
    predictions["height_linear_prediction_kg_dm_ha"] = np.nan
    folds = []

    for fold_index, (train_index, test_index) in enumerate(splitter.split(features, labels, groups), start=1):
        train_groups = set(groups.iloc[train_index])
        test_groups = set(groups.iloc[test_index])
        if train_groups & test_groups:
            raise ValueError(f"spatial leakage in GroupKFold fold {fold_index}")
        train_labels = labels.iloc[train_index]
        test_labels = labels.iloc[test_index]
        median_prediction = float(train_labels.median())
        median_predictions = pd.Series(median_prediction, index=test_labels.index)
        model = LinearRegression()
        model.fit(features.iloc[train_index], train_labels)
        linear_predictions = pd.Series(model.predict(features.iloc[test_index]), index=test_labels.index)

        predictions.loc[test_labels.index, "fold"] = fold_index
        predictions.loc[test_labels.index, "training_median_prediction_kg_dm_ha"] = median_prediction
        predictions.loc[test_labels.index, "height_linear_prediction_kg_dm_ha"] = linear_predictions
        folds.append({
            "fold": fold_index,
            "trainRows": int(len(train_index)),
            "testRows": int(len(test_index)),
            "trainSpatialGroups": int(len(train_groups)),
            "testSpatialGroups": int(len(test_groups)),
            "trainFarms": sorted(complete.iloc[train_index]["farm"].astype(str).unique().tolist()),
            "testFarms": sorted(complete.iloc[test_index]["farm"].astype(str).unique().tolist()),
            "testRowsByFarm": {
                str(key): int(value)
                for key, value in complete.iloc[test_index].groupby("farm").size().sort_index().items()
            },
            "testRowsByCampaign": {
                str(key): int(value)
                for key, value in complete.iloc[test_index].groupby("campaign").size().sort_index().items()
            },
            "spatialGroupOverlap": 0,
            "trainingMedianKgDmHa": median_prediction,
            "linearHeightIntercept": float(model.intercept_),
            "linearHeightCoefficientKgDmHaPerCm": float(model.coef_[0]),
            "medianBaseline": metric_summary(test_labels, median_predictions),
            "heightLinearRegression": metric_summary(test_labels, linear_predictions),
        })

    if predictions["fold"].lt(1).any() or predictions[[
        "training_median_prediction_kg_dm_ha", "height_linear_prediction_kg_dm_ha"
    ]].isna().any(axis=None):
        raise ValueError("OOF predictions do not cover every eligible row exactly once")

    subgroup_metrics = []
    for (farm, campaign), subgroup in predictions.groupby(["farm", "campaign"], sort=True):
        subgroup_metrics.append({
            "farm": str(farm),
            "campaign": str(campaign),
            "spatialGroups": int(subgroup["spatial_group_id"].nunique()),
            "trainingMedian": metric_summary(
                subgroup["observed_dry_matter_yield_kg_dm_ha"],
                subgroup["training_median_prediction_kg_dm_ha"],
            ),
            "heightLinearRegression": metric_summary(
                subgroup["observed_dry_matter_yield_kg_dm_ha"],
                subgroup["height_linear_prediction_kg_dm_ha"],
            ),
        })

    predictions = predictions.reset_index(drop=True)
    eligible_campaigns_per_group = complete.groupby("spatial_group_id")["campaign"].nunique()
    csv_bytes = predictions.to_csv(index=False, float_format="%.8f", lineterminator="\n").encode("utf-8")
    evaluation = {
        "status": "INTERNAL_GROUPED_OOF_DIAGNOSTIC_ONLY_NOT_EXTERNAL_VALIDATION",
        "eligibleRows": int(len(complete)),
        "eligibleSpatialGroups": int(groups.nunique()),
        "eligibleSpatialGroupsRepeatedAcrossCampaigns": int((eligible_campaigns_per_group > 1).sum()),
        "eligibleRowsInRepeatedSpatialGroups": int(complete.duplicated(GROUP_KEYS, keep=False).sum()),
        "excludedRowsDueToMissingHeightOrTarget": int(len(frame) - len(complete)),
        "farmsCovered": sorted(complete["farm"].astype(str).unique().tolist()),
        "campaignsCovered": sorted(complete["campaign"].astype(str).unique().tolist()),
        "campaignsNotCovered": sorted(set(frame["campaign"].astype(str)) - set(complete["campaign"].astype(str))),
        "heightFeature": "sward_height_cm",
        "target": TARGET,
        "groupKeys": GROUP_KEYS,
        "splitter": "sklearn.model_selection.GroupKFold(n_splits=5); fixed data row order; deterministic for this input and sklearn version",
        "scikitLearnVersion": sklearn.__version__,
        "models": {
            "baseline": "median of training-fold observed dry biomass, repeated for every test row",
            "simpleModel": "univariate ordinary least squares: training-fold sward_height_cm -> dry_matter_yield_kg_dm_ha",
            "preprocessing": "none; one observed numeric predictor, no imputation or scaling",
        },
        "overallMetrics": {
            "trainingMedian": metric_summary(
                predictions["observed_dry_matter_yield_kg_dm_ha"],
                predictions["training_median_prediction_kg_dm_ha"],
            ),
            "heightLinearRegression": metric_summary(
                predictions["observed_dry_matter_yield_kg_dm_ha"],
                predictions["height_linear_prediction_kg_dm_ha"],
            ),
        },
        "metricsByFarmAndCampaign": subgroup_metrics,
        "folds": folds,
        "predictionsArtifact": {
            "path": str(OUTPUT_OOF.relative_to(ROOT)),
            "rows": int(len(predictions)),
            "sha256": hashlib.sha256(csv_bytes).hexdigest(),
            "format": "csv",
        },
        "interpretationLimits": [
            "All OOF rows are restricted to the two campaigns with measured sward height; June 2018 is excluded because height is missing for every row.",
            "The split keeps every repeated farm/field/pixel/point location in one fold, but neighboring points within a pixel may remain spatially correlated.",
            "Both farms and campaigns occur across train and test folds; this is an internal diagnostic, not a holdout for new farms, regions, seasons, or operating conditions.",
            "Only two farms exist, and leave-one-farm-out remains a two-fold design with management class 3 unique to Santa Clara.",
            "The exercise predicts harvested quadrat forage biomass from sward height only; it does not evaluate DMI, ADG, pasture inventory, or an operational farm decision.",
        ],
    }
    return evaluation, predictions


def build_report() -> tuple[dict[str, Any], pd.DataFrame]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    quality = json.loads(QUALITY_REPORT.read_text(encoding="utf-8"))
    frame = pd.read_parquet(PARQUET)
    expected_hash = quality["outputs"][0]["sha256"]
    actual_hash = sha256(PARQUET)
    if actual_hash != expected_hash:
        raise ValueError(f"processed Parquet checksum mismatch: {actual_hash} != {expected_hash}")
    if manifest["source"]["doi"] != "10.17632/nj72kmdj77.1":
        raise ValueError("unexpected source DOI")
    required = {TARGET, "dry_matter_weight_g", "dry_matter_yield_tonnes_ha", *GROUP_KEYS}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"processed table is missing required columns: {missing}")
    if frame[GROUP_KEYS + ["campaign"]].isna().any(axis=None):
        raise ValueError("group identifiers or campaign contain missing values")

    groups = frame.groupby(GROUP_KEYS, dropna=False)
    campaigns_per_group = groups["campaign"].nunique()
    farm_counts = frame.groupby("farm", dropna=False).size().sort_index()
    farm_fields = frame.groupby("farm", dropna=False)["field_code"].nunique().sort_index()
    farm_campaign_counts = (
        frame.groupby(["farm", "campaign"], dropna=False).size().sort_index()
    )
    management_by_farm = (
        frame.groupby("farm", dropna=False)["management_type"]
        .apply(lambda values: sorted({str(value) for value in values.dropna()}))
        .sort_index()
    )

    target_from_sample_mass = frame["dry_matter_weight_g"] * 40.0
    target_from_source_yield = frame["dry_matter_yield_tonnes_ha"] * 1000.0
    max_mass_delta = float((target_from_sample_mass - frame[TARGET]).abs().max())
    max_source_yield_delta = float((target_from_source_yield - frame[TARGET]).abs().max())
    if max(max_mass_delta, max_source_yield_delta) > 1e-5:
        raise ValueError("target aliases are not consistent with source measurements")
    internal_oof, oof_predictions = run_internal_grouped_oof(frame)

    farm_holdouts = []
    farms = sorted(frame["farm"].unique().tolist())
    for held_out_farm in farms:
        train = frame[frame["farm"] != held_out_farm]
        test = frame[frame["farm"] == held_out_farm]
        train_management = {str(value) for value in train["management_type"].dropna().unique()}
        test_management = {str(value) for value in test["management_type"].dropna().unique()}
        farm_holdouts.append({
            "heldOutFarm": held_out_farm,
            "trainRows": int(len(train)),
            "testRows": int(len(test)),
            "trainFarmCount": int(train["farm"].nunique()),
            "testFarmCount": int(test["farm"].nunique()),
            "testManagementLevelsAbsentFromTrain": sorted(test_management - train_management),
            "status": "NO_FARM_HOLDOUT_MODEL_OR_METRICS",
        })

    columns_with_target_identity = [
        "dry_matter_weight_g",
        "dry_matter_yield_tonnes_ha",
        TARGET,
    ]
    report = {
        "schemaVersion": "1.0.0",
        "sourceDoi": manifest["source"]["doi"],
        "sourceLicense": manifest["source"]["license"],
        "artifactType": "predictive_readiness_with_internal_grouped_oof_diagnostic",
        "module": "forage_biomass_and_productivity",
        "notDmiOrAdg": True,
        "predictionReadiness": "NO_GO_FOR_GENERALIZABLE_PREDICTION",
        "supportedUse": "DESCRIPTIVE_BIOMASS_OBSERVATIONS_AND_INTERNAL_GROUPED_OOF_DIAGNOSTIC_ONLY",
        "inputs": [
            {"path": str(PARQUET.relative_to(ROOT)), "sha256": actual_hash, "rows": int(len(frame))},
            {"path": str(QUALITY_REPORT.relative_to(ROOT)), "sha256": sha256(QUALITY_REPORT)},
            {"path": str(MANIFEST.relative_to(ROOT)), "sha256": sha256(MANIFEST)},
        ],
        "target": {
            "column": TARGET,
            "meaning": "measured dry above-ground forage mass scaled to kg DM/ha from a 0.25 m2 sample",
            "unit": "kg DM/ha",
            "sourceMethod": "cut sample dry weight after oven drying; observed forage biomass, not animal intake",
            "rows": int(frame[TARGET].notna().sum()),
            "derivations": {
                "dry_matter_weight_g_times_40": {
                    "maxAbsoluteDifferenceKgHa": max_mass_delta,
                    "interpretation": "same target measurement expressed per 0.25 m2 sample; never a predictor",
                },
                "dry_matter_yield_tonnes_ha_times_1000": {
                    "maxAbsoluteDifferenceKgHa": max_source_yield_delta,
                    "interpretation": "same target in source units; never a predictor",
                },
            },
        },
        "design": {
            "rows": int(len(frame)),
            "farms": {str(name): int(count) for name, count in farm_counts.items()},
            "farmCount": int(frame["farm"].nunique()),
            "fieldsByFarm": {str(name): int(count) for name, count in farm_fields.items()},
            "campaignRows": {str(name): int(count) for name, count in frame["campaign"].value_counts().sort_index().items()},
            "farmCampaignRows": {
                f"{farm}|{campaign}": int(count)
                for (farm, campaign), count in farm_campaign_counts.items()
            },
            "managementLevelsByFarm": {
                str(name): values for name, values in management_by_farm.items()
            },
            "spatialGroupKey": GROUP_KEYS,
            "uniqueSpatialGroups": int(len(campaigns_per_group)),
            "spatialGroupsRepeatedAcrossCampaigns": int((campaigns_per_group > 1).sum()),
            "rowsBelongingToRepeatedSpatialGroups": int(
                frame.duplicated(GROUP_KEYS, keep=False).sum()
            ),
            "swardHeightObservedRows": int(frame["sward_height_cm"].notna().sum()),
            "swardHeightMissingCampaigns": sorted(
                frame.loc[frame["sward_height_cm"].isna(), "campaign"].unique().tolist()
            ),
        },
        "featureAudit": {
            "candidateOnlyAfterOperationalAvailabilityIsDocumented": [
                {
                    "column": "management_type",
                    "reason": "management category is recorded, but class 3 occurs at only one farm and farm-level confounding is strong",
                },
                {
                    "column": "campaign",
                    "reason": "three collection campaigns could represent season; a campaign holdout must also group repeated spatial points",
                },
                {
                    "column": "sward_height_cm",
                    "reason": "measured forage height could be a field predictor, but is absent for all June 2018 rows and measurement timing must be available before biomass sampling",
                },
                {
                    "column": "cattle_present_source",
                    "reason": "source says animal presence during biomass collection; use only if known at the intended prediction time",
                },
            ],
            "excludedFromPredictors": [
                {"column": TARGET, "reason": "target"},
                {"column": "dry_matter_weight_g", "reason": "same harvested dry-mass target before area scaling"},
                {"column": "dry_matter_yield_tonnes_ha", "reason": "same target in source units; exact linear alias"},
                {"column": "fresh_harvest_weight_g", "reason": "mass of the same clipped sample; post-sampling proxy for target"},
                {"column": "fresh_green_weight_g", "reason": "component weight from the same clipped sample; post-sampling proxy"},
                {"column": "fresh_other_weight_g", "reason": "component weight from the same clipped sample; post-sampling proxy"},
                {"column": "farm, field_code, field_name, pixel_id, sampling_point_id", "reason": "IDs used for grouping/holdout only; not generalizable covariates"},
                {"column": "latitude_deg, longitude_deg", "reason": "spatial coordinates retained for provenance and grouping; including them risks site memorization in a two-farm sample"},
                {"column": "observation_note_source", "reason": "free-text note with 335/342 missing and not a stable predictive input"},
                {"column": "soil workbooks", "reason": "separate sampling tables not joined into this cohort; exact operational timing and one-to-one alignment are not established by this processing pipeline"},
            ],
            "targetIdentityColumns": columns_with_target_identity,
        },
        "holdoutReadiness": {
            "randomRowSplit": "PROHIBITED; repeats the same spatial points across campaigns and leaks site identity",
            "requiredGrouping": GROUP_KEYS,
            "farmHoldoutFolds": farm_holdouts,
            "internalGroupedOof": internal_oof,
            "independentFarmDomains": int(frame["farm"].nunique()),
            "assessment": "two leave-one-farm-out folds are descriptive only: each fold trains on one farm, tests on one farm, and farm/management support differs; two farms do not establish external transportability",
            "recommendedNextEvaluation": "the internal 5-fold spatial GroupKFold diagnostic has been completed. Before making transportability claims, evaluate a pre-specified model on an independent third farm (ideally a different region or production setting), with sward height measured at prediction time, and report performance by farm and campaign; the current OOF scores are not external validation",
            "modelTrainingPerformed": True,
            "metricsReported": True,
        },
        "limitations": [
            "342 point-level observations represent only 162 spatial sampling groups, with 108 groups revisited across campaigns.",
            "The dataset covers only two farms in one region; the leave-one-farm-out design has only two folds and cannot support broad transfer claims.",
            "Management class 3 appears only at Santa Clara, entangling one management level with farm identity.",
            "Only three campaigns exist, and sward height is missing for all June 2018 observations.",
            "The target is harvested forage mass at a small quadrat, not standing inventory, animal intake, DMI, ADG, or whole-paddock carrying capacity.",
            "The internal one-feature model is a grouped cross-validation diagnostic only; it is not external validation and supports no calibration or uncertainty claim.",
        ],
    }
    return report, oof_predictions


def render_markdown(report: dict[str, Any]) -> str:
    design = report["design"]
    target = report["target"]
    oof = report["holdoutReadiness"]["internalGroupedOof"]
    baseline_metrics = oof["overallMetrics"]["trainingMedian"]
    model_metrics = oof["overallMetrics"]["heightLinearRegression"]
    rows = [
        "# Mendeley pasture biomass prediction readiness",
        "",
        f"Source: [Mendeley Data {report['sourceDoi']}](https://doi.org/{report['sourceDoi']}) ({report['sourceLicense']}).",
        "",
        f"**Decision: {report['predictionReadiness']}** for generalized prediction. The source supports descriptive analysis of measured forage biomass; it does not support claims about DMI or ADG.",
        "",
        "## Estimand and input audit",
        "",
        f"Use `{target['column']}` ({target['unit']}) as the observed cut-quadrat dry forage mass scaled from 0.25 m². It is exactly equivalent, within the processing tolerance, to `dry_matter_weight_g × 40` and `dry_matter_yield_tonnes_ha × 1000`; neither alias may be included as a predictor.",
        "",
        "Candidate inputs for a future local biomass model are management category, collection campaign, sward height, and cattle presence, after their availability at prediction time is established. Fresh weights come from the same clipped sample and are excluded as post-sampling proxies. Farm, field, pixel, point, and coordinates remain grouping/provenance variables, not model features.",
        "",
        "The separate soil workbooks were not joined: the current processing pipeline does not establish an operationally valid, one-to-one pre-outcome feature table for them.",
        "",
        "## Group and holdout audit",
        "",
        f"The processed table has {design['rows']} rows, {design['uniqueSpatialGroups']} distinct `{', '.join(design['spatialGroupKey'])}` groups, and {design['spatialGroupsRepeatedAcrossCampaigns']} groups repeated across campaigns. {design['rowsBelongingToRepeatedSpatialGroups']} rows belong to groups with repeated observations. Random row splitting is prohibited.",
        "",
        f"There are {design['farmCount']} farms and only three campaigns. Management level 3 occurs at one farm only. Leave-one-farm-out has two descriptive folds: each trains on one farm and tests on the other, so it cannot establish farm-independent transportability.",
        "",
        "| Farm held out | Train rows | Test rows | Management levels present only in test |",
        "|---|---:|---:|---|",
    ]
    for fold in report["holdoutReadiness"]["farmHoldoutFolds"]:
        unseen = ", ".join(fold["testManagementLevelsAbsentFromTrain"]) or "none"
        rows.append(f"| {fold['heldOutFarm']} | {fold['trainRows']} | {fold['testRows']} | {unseen} |")
    rows.extend([
        "",
        "## Internal grouped OOF diagnostic",
        "",
        f"A deterministic 5-fold `GroupKFold` diagnostic was run on {oof['eligibleRows']} complete records from {', '.join(oof['campaignsCovered'])}; June 2018 is excluded because height is missing. Groups are the full spatial key above, so repeated visits to each point stay in one fold. The single predictor is sward height; each fold fits both the training-fold median baseline and ordinary least squares using height alone.",
        "",
        "| OOF model | MAE (kg DM/ha) | RMSE (kg DM/ha) | Bias, predicted − observed (kg DM/ha) |",
        "|---|---:|---:|---:|",
        f"| Training-fold median | {baseline_metrics['maeKgDmHa']:.3f} | {baseline_metrics['rmseKgDmHa']:.3f} | {baseline_metrics['biasPredictedMinusObservedKgDmHa']:.3f} |",
        f"| Linear regression on height | {model_metrics['maeKgDmHa']:.3f} | {model_metrics['rmseKgDmHa']:.3f} | {model_metrics['biasPredictedMinusObservedKgDmHa']:.3f} |",
        "",
        "Subgroup metrics by farm and campaign are in the JSON artifact. These scores describe only held-out sampling points within the same two farms and two campaigns. Nearby points may still be spatially correlated, and a third farm is still needed for external transfer claims. No DMI/ADG, calibration, uncertainty, or pasture-inventory conclusion follows from this biomass-only diagnostic.",
        "",
        "The OOF table records fold assignments and predictions at `docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv`.",
        "",
        "## Scope and reproducibility",
        "",
        "The reported MAE, RMSE, and bias are out-of-fold internal diagnostics for the two farms and two campaigns with height observations. They do not constitute external validation or establish performance on new farms, seasons, or regions. The JSON report records input checksums, target-equivalence checks, group counts, feature exclusions, holdout design, and diagnostic metrics. Rebuild the report and OOF table with:",
        "",
        "```bash",
        "uv run --python 3.12 --with-requirements requirements-data-processing.txt --with scikit-learn==1.5.2 -- python scripts/audit_mendeley_pasture_biomass_prediction_readiness.py",
        "```",
        "",
    ])
    return "\n".join(rows)


def main() -> None:
    report, predictions = build_report()
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_OOF.write_text(
        predictions.to_csv(index=False, float_format="%.8f", lineterminator="\n"),
        encoding="utf-8",
    )
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    OUTPUT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({
        "json": str(OUTPUT_JSON.relative_to(ROOT)),
        "markdown": str(OUTPUT_MD.relative_to(ROOT)),
        "readiness": report["predictionReadiness"],
        "rows": report["design"]["rows"],
        "farms": report["design"]["farmCount"],
    }, indent=2))


if __name__ == "__main__":
    main()
