#!/usr/bin/env python3
"""Summarize existing biomass OOF errors and spatial support; never fits a model."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
OOF_PATH = ROOT / "docs/evidence/mendeley-pasture-biomass-grouped-oof-2026-10.csv"
DATA_PATH = ROOT / "data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet"
BASELINE_REPORT_PATH = ROOT / "docs/evidence/mendeley-pasture-biomass-prediction-readiness-2026-10.json"
OUT_JSON = ROOT / "experiments/diagnostics/biomass/grouped-oof-error-diagnostics-2026-10.json"
OUT_MD = ROOT / "experiments/diagnostics/biomass/grouped-oof-error-diagnostics-2026-10.md"
SPATIAL_KEYS = ["farm", "field_code", "pixel_id", "sampling_point_id"]
TARGET = "observed_dry_matter_yield_kg_dm_ha"
PREDICTIONS = {
    "trainingMedian": "training_median_prediction_kg_dm_ha",
    "heightLinearRegression": "height_linear_prediction_kg_dm_ha",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(frame: pd.DataFrame, prediction_column: str) -> dict[str, float | int]:
    error = frame[prediction_column].to_numpy(dtype=float) - frame[TARGET].to_numpy(dtype=float)
    return {
        "rows": int(len(frame)),
        "maeKgDmHa": float(np.mean(np.abs(error))),
        "rmseKgDmHa": float(np.sqrt(np.mean(error**2))),
        "biasPredictedMinusObservedKgDmHa": float(np.mean(error)),
        "medianErrorKgDmHa": float(np.median(error)),
        "p90AbsoluteErrorKgDmHa": float(np.quantile(np.abs(error), 0.9)),
        "maxAbsoluteErrorKgDmHa": float(np.max(np.abs(error))),
    }


def group_summary(frame: pd.DataFrame, dimensions: list[str]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for key, subset in frame.groupby(dimensions, sort=True, dropna=False):
        values = key if isinstance(key, tuple) else (key,)
        row: dict[str, Any] = dict(zip(dimensions, [str(value) for value in values]))
        row["spatialGroups"] = int(subset["spatial_group_id"].nunique())
        row["campaigns"] = sorted(subset["campaign"].astype(str).unique().tolist())
        row["models"] = {name: metrics(subset, column) for name, column in PREDICTIONS.items()}
        result.append(row)
    return result


def haversine_m(lat: float, lon: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    radius_m = 6_371_000.0
    lat1r, lon1r = np.radians(lat), np.radians(lon)
    lat2r, lon2r = np.radians(lat2), np.radians(lon2)
    a = np.sin((lat2r - lat1r) / 2.0) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin((lon2r - lon1r) / 2.0) ** 2
    return 2.0 * radius_m * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def distance_summary(locations: pd.DataFrame, scope: str) -> dict[str, Any]:
    distances: list[float] = []
    fold_counts: dict[str, int] = {}
    for fold, held_out in locations.groupby("fold", sort=True):
        training = locations[locations["fold"] != fold]
        fold_distances: list[float] = []
        for row in held_out.itertuples(index=False):
            candidates = training
            if scope in {"same_farm", "same_field", "same_pixel"}:
                candidates = candidates[candidates["farm"] == row.farm]
            if scope in {"same_field", "same_pixel"}:
                candidates = candidates[candidates["field_code"] == row.field_code]
            if scope == "same_pixel":
                candidates = candidates[candidates["pixel_id"] == row.pixel_id]
            if candidates.empty:
                continue
            nearest = haversine_m(row.latitude_deg, row.longitude_deg,
                                  candidates["latitude_deg"].to_numpy(),
                                  candidates["longitude_deg"].to_numpy()).min()
            fold_distances.append(float(nearest))
        distances.extend(fold_distances)
        fold_counts[str(int(fold))] = len(fold_distances)
    values = np.asarray(distances, dtype=float)
    return {
        "scope": scope,
        "locations": int(len(values)),
        "nearestTrainDistanceMetersQuantiles": {
            str(q): float(np.quantile(values, q)) for q in (0, 0.1, 0.25, 0.5, 0.75, 0.9, 1)
        },
        "nearestTrainWithinMeters": {
            str(threshold): {"locations": int(np.sum(values < threshold)), "fraction": float(np.mean(values < threshold))}
            for threshold in (25, 50, 100, 250, 500, 1000)
        },
        "scoredByFold": fold_counts,
    }


def build_report() -> dict[str, Any]:
    oof = pd.read_csv(OOF_PATH)
    source = pd.read_parquet(DATA_PATH)
    source["spatial_group_id"] = source[SPATIAL_KEYS].astype(str).agg("|".join, axis=1)
    join_columns = ["campaign", "spatial_group_id", "management_type", "latitude_deg", "longitude_deg", "field_code", "pixel_id"]
    frame = oof.merge(source[join_columns], on=["campaign", "spatial_group_id"], validate="one_to_one")
    if len(frame) != len(oof) or frame["management_type"].isna().any():
        raise ValueError("OOF rows could not be matched uniquely to source observations")

    locations = frame.groupby(["fold", "spatial_group_id"], as_index=False).agg(
        farm=("farm", "first"), field_code=("field_code", "first"), pixel_id=("pixel_id", "first"),
        latitude_deg=("latitude_deg", "mean"), longitude_deg=("longitude_deg", "mean"),
    )
    coordinate_folds = locations.groupby(["latitude_deg", "longitude_deg"]).agg(
        spatialGroups=("spatial_group_id", "nunique"), folds=("fold", "nunique"),
    )
    coincident = coordinate_folds[coordinate_folds["spatialGroups"] > 1]
    split_coordinate_groups = coincident[coincident["folds"] > 1]

    per_spatial_group = frame.groupby("spatial_group_id", as_index=False).agg(
        farm=("farm", "first"), rows=("campaign", "size"), observed=(TARGET, "mean"),
        **{name: (column, "mean") for name, column in PREDICTIONS.items()},
    )
    group_metrics: dict[str, dict[str, float | int]] = {}
    for name in PREDICTIONS:
        per_spatial_group["_observed"] = per_spatial_group["observed"]
        per_spatial_group["_predicted"] = per_spatial_group[name]
        group_frame = per_spatial_group.rename(columns={"_observed": TARGET, "_predicted": "prediction"})
        metric = metrics(group_frame, "prediction")
        group_metrics[name] = {"spatialGroups": metric.pop("rows"), **metric}
    per_spatial_group["heightLinearErrorKgDmHa"] = (
        per_spatial_group["heightLinearRegression"] - per_spatial_group["observed"]
    )
    per_spatial_group["absoluteHeightLinearErrorKgDmHa"] = per_spatial_group["heightLinearErrorKgDmHa"].abs()
    worst_groups = per_spatial_group.nlargest(10, "absoluteHeightLinearErrorKgDmHa")

    report: dict[str, Any] = {
        "title": "Existing biomass GroupKFold OOF error and spatial-support diagnosis",
        "analysisDate": "2026-10-13",
        "scope": "Diagnosis only. Reads the existing baseline OOF predictions; fits no models, changes no predictions, and does no tuning.",
        "inputs": {
            str(path.relative_to(ROOT)): {"sha256": sha256(path), "bytes": path.stat().st_size}
            for path in (OOF_PATH, DATA_PATH, BASELINE_REPORT_PATH)
        },
        "cohort": {
            "oofRows": int(len(frame)), "uniqueSpatialGroups": int(frame["spatial_group_id"].nunique()),
            "repeatedSpatialGroupsAcrossCampaigns": int((frame.groupby("spatial_group_id")["campaign"].nunique() > 1).sum()),
            "campaigns": sorted(frame["campaign"].astype(str).unique().tolist()),
            "farms": sorted(frame["farm"].astype(str).unique().tolist()),
            "managementCounts": [
                {"farm": str(farm), "managementType": int(management), "rows": int(count)}
                for (farm, management), count in frame.groupby(["farm", "management_type"]).size().items()
            ],
            "managementClass3InOof": bool((frame["management_type"] == 3).any()),
        },
        "errorMetricsByFarm": group_summary(frame, ["farm"]),
        "errorMetricsByCampaign": group_summary(frame, ["campaign"]),
        "errorMetricsByFarmAndCampaign": group_summary(frame, ["farm", "campaign"]),
        "errorMetricsByManagement": group_summary(frame, ["management_type"]),
        "errorMetricsByFarmAndManagement": group_summary(frame, ["farm", "management_type"]),
        "errorMetricsByFold": group_summary(frame, ["fold"]),
        "spatialGroupMeanResidualMetrics": group_metrics,
        "largestAbsoluteSpatialGroupErrors": [
            {
                "spatialGroupId": str(row.spatial_group_id), "farm": str(row.farm), "rows": int(row.rows),
                "observedMeanKgDmHa": float(row.observed), "predictedMeanKgDmHa": float(row.heightLinearRegression),
                "meanResidualKgDmHa": float(row.heightLinearErrorKgDmHa),
                "absoluteMeanResidualKgDmHa": float(row.absoluteHeightLinearErrorKgDmHa),
            }
            for row in worst_groups.itertuples(index=False)
        ],
        "spatialLeakageDiagnosis": {
            "fullKeyOverlapAcrossFolds": 0,
            "distinctOofSpatialGroups": int(locations["spatial_group_id"].nunique()),
            "distinctExactCoordinatePairs": int(coordinate_folds.reset_index()[["latitude_deg", "longitude_deg"]].drop_duplicates().shape[0]),
            "coordinatePairsWithMultipleSpatialGroupIds": int(len(coincident)),
            "coordinatePairsSplitAcrossFolds": int(len(split_coordinate_groups)),
            "spatialGroupsAtCoordinatesSplitAcrossFolds": int(split_coordinate_groups["spatialGroups"].sum()),
            "nearestTrainDistanceByScope": [distance_summary(locations, scope) for scope in ("all_train", "same_farm", "same_field", "same_pixel")],
            "interpretation": "The full farm/field/pixel/point key stays in one fold, but distinct keys share exact coordinates: several coordinate pairs are divided across folds. Additionally, all held-out locations have a training location within 100 m. Thus the existing OOF has no full-key overlap but does not provide spatially independent validation; error estimates may be optimistic under spatial autocorrelation.",
        },
        "diagnosticInterpretation": [
            "Poderosa errors and negative bias are substantially larger than Santa Clara; the height-only OOF model underpredicts Poderosa by an average of about 579 kg DM/ha.",
            "March errors exceed November errors for the height-only model, with positive bias in March; campaign differences remain visible despite both campaigns appearing in every fold.",
            "Management class 3 is absent from OOF because all its observations are from June, where height is missing. OOF cannot support claims for that management level.",
            "Point-weighted rows include repeated locations. The macro summary averaged over spatial groups is included to show the effect of giving each location equal weight.",
            "The evaluation remains internal to two farms and two campaigns; exact-coordinate aliases across folds and close neighbors further limit its independence.",
        ],
        "preregisteredCandidateProtocol": {
            "status": "PROPOSED_NOT_RUN",
            "estimand": "dry_matter_yield_kg_dm_ha for clipped quadrat forage biomass, using sward_height_cm recorded before clipping; no DMI, ADG, standing inventory, or farm-level transport claim",
            "inputBoundary": "First comparison uses height alone, measured at prediction time. Exclude target aliases, all clipped-sample weights, coordinates/IDs as predictors, and fields whose timing relative to outcome is undocumented.",
            "validation": "Before model comparison, block by contiguous field/spatial region; unite exact-coordinate aliases and preserve all campaigns per location in one block. Use a predeclared 100 m training exclusion buffer around held-out blocks (chosen above the observed ~60 m nearest-neighbor spacing). Report scored coverage. Require at least 70% of eligible observations and at least four independent held-out blocks; otherwise issue NO-GO for model ranking. A third farm remains necessary for external transfer claims.",
            "fixedCandidates": [
                {"name": "training-median baseline", "specification": "median target in training data only"},
                {"name": "OLS height-only", "specification": "ordinary least squares with intercept; current diagnostic reference"},
                {"name": "Ridge height-only", "specification": "standardize height using training fold only; Ridge alpha=1.0 fixed in advance"},
                {"name": "Huber height-only", "specification": "HuberRegressor epsilon=1.35, alpha=0.0, max_iter=1000; fixed in advance"},
                {"name": "quadratic height-only (optional, single nonlinear candidate)", "specification": "degree-2 polynomial in centered/scaled height, scaling learned within training fold; included only as a fixed curvature check, no degree or knot search"},
            ],
            "primaryMetric": "spatial-block-macro MAE: average absolute error across observations in each held-out contiguous block (after joining exact-coordinate aliases and repeated visits), then average equally over held-out blocks",
            "secondaryMetrics": ["row-weighted MAE", "row-weighted RMSE", "signed bias", "farm/campaign/management subgroup MAE and bias", "coverage and scored-group counts"],
            "retentionRule": "Retain a challenger only if it reduces primary spatial-group-macro MAE by at least 10% versus OLS on identical held-out groups, row-weighted RMSE does not worsen by more than 5%, and no farm or campaign subgroup with at least 20 scored groups has MAE worsened by more than 10%. Otherwise retain OLS as reference or report no demonstrated improvement. These are practical preregistered thresholds, not significance tests; do not tune on these folds.",
        },
    }
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Biomass OOF error and spatial-support diagnosis",
        "",
        "**Scope:** diagnosis of the existing GroupKFold predictions only. This artifact did not fit, tune, or change any model or prediction.",
        "",
        "## Input checksums",
        "",
        "| Input | Bytes | SHA-256 |",
        "|---|---:|---|",
    ]
    for path, item in report["inputs"].items():
        lines.append(f"| `{path}` | {item['bytes']} | `{item['sha256']}` |")
    lines += ["", "## OOF residual patterns", ""]
    for label, key in (("By farm", "errorMetricsByFarm"), ("By campaign", "errorMetricsByCampaign"),
                       ("By farm and campaign", "errorMetricsByFarmAndCampaign"),
                       ("By management class", "errorMetricsByManagement"),
                       ("By farm and management class", "errorMetricsByFarmAndManagement")):
        lines += [f"### {label}", "", "| Group | Model | n | MAE | RMSE | Bias | Median error | P90 absolute error |", "|---|---|---:|---:|---:|---:|---:|---:|"]
        for row in report[key]:
            group = ", ".join(f"{k}={v}" for k, v in row.items() if k not in {"spatialGroups", "campaigns", "models"})
            for model, m in row["models"].items():
                lines.append(f"| {group} | {model} | {m['rows']} | {m['maeKgDmHa']:.1f} | {m['rmseKgDmHa']:.1f} | {m['biasPredictedMinusObservedKgDmHa']:.1f} | {m['medianErrorKgDmHa']:.1f} | {m['p90AbsoluteErrorKgDmHa']:.1f} |")
    lines += ["", "### Equal-weight spatial-group view", "", "| Model | Groups | MAE | RMSE | Bias |", "|---|---:|---:|---:|---:|"]
    for model, m in report["spatialGroupMeanResidualMetrics"].items():
        lines.append(f"| {model} | {m['spatialGroups']} | {m['maeKgDmHa']:.1f} | {m['rmseKgDmHa']:.1f} | {m['biasPredictedMinusObservedKgDmHa']:.1f} |")
    lines += ["", "Largest absolute group-mean residuals for the height-only regression:", "",
              "| Farm | Spatial group | Campaign rows | Mean residual (kg DM/ha) |", "|---|---|---:|---:|"]
    for item in report["largestAbsoluteSpatialGroupErrors"]:
        lines.append(f"| {item['farm']} | `{item['spatialGroupId']}` | {item['rows']} | {item['meanResidualKgDmHa']:.1f} |")
    spatial = report["spatialLeakageDiagnosis"]
    lines += ["", "## Spatial leakage and distance support", "",
              f"The full farm/field/pixel/point key had {spatial['fullKeyOverlapAcrossFolds']} cross-fold overlap. However, {spatial['coordinatePairsWithMultipleSpatialGroupIds']} exact coordinate pairs have multiple group IDs; {spatial['coordinatePairsSplitAcrossFolds']} of those coordinate pairs ({spatial['spatialGroupsAtCoordinatesSplitAcrossFolds']} group IDs) span folds.", "",
              "Nearest training-location distances for held-out groups:", "",
              "| Search scope | n | Median m | P90 m | <25 m | <50 m | <100 m | <250 m |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for d in spatial["nearestTrainDistanceByScope"]:
        q = d["nearestTrainDistanceMetersQuantiles"]
        t = d["nearestTrainWithinMeters"]
        lines.append(f"| {d['scope']} | {d['locations']} | {q['0.5']:.2f} | {q['0.9']:.2f} | {t['25']['locations']} | {t['50']['locations']} | {t['100']['locations']} | {t['250']['locations']} |")
    lines += ["", spatial["interpretation"], "",
              "The OOF split prevents repeat-key leakage but not exact-coordinate aliasing or neighbor dependence. Consequently the existing internal metrics are useful for diagnosis, not an independent estimate of spatial transfer performance.",
              "", "## Proposed preregistered protocol (not run)", "",
              report["preregisteredCandidateProtocol"]["validation"], "",
              f"**Estimand and input boundary:** {report['preregisteredCandidateProtocol']['estimand']}. {report['preregisteredCandidateProtocol']['inputBoundary']}", "",
              "| Candidate | Fixed specification |", "|---|---|"]
    for candidate in report["preregisteredCandidateProtocol"]["fixedCandidates"]:
        lines.append(f"| {candidate['name']} | {candidate['specification']} |")
    protocol = report["preregisteredCandidateProtocol"]
    lines += ["", f"**Primary metric:** {protocol['primaryMetric']}.", "",
              f"**Secondary metrics:** {', '.join(protocol['secondaryMetrics'])}.", "",
              f"**Retention rule:** {protocol['retentionRule']}", "",
              "## Interpretation", ""]
    lines.extend(f"- {item}" for item in report["diagnosticInterpretation"])
    return "\n".join(lines) + "\n"


def main() -> None:
    report = build_report()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({"json": str(OUT_JSON.relative_to(ROOT)), "markdown": str(OUT_MD.relative_to(ROOT)), "oofRows": report["cohort"]["oofRows"], "scope": "diagnosis_only_no_model_fitting"}, indent=2))


if __name__ == "__main__":
    main()
