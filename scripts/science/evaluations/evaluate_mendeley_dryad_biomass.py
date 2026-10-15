#!/usr/bin/env python3
"""Run the frozen buffered biomass development CV and one Dryad external test."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import HuberRegressor, LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler


ROOT = Path(__file__).resolve().parents[3]
PROTOCOL = ROOT / "experiments/diagnostics/biomass/preregister-mendeley-to-dryad-biomass-2026-10.json"
MEND = ROOT / "data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet"
DRYAD = ROOT / "data/dryad-mob-rotational-biomass/processed/dryad-paddock-biomass-height-v1.parquet"
OUTPUT_DIR = ROOT / "experiments/biomass"
DEV_DIR = OUTPUT_DIR / "mendeley-spatial-cv"
EXT_DIR = OUTPUT_DIR / "dryad-external"
TARGET = "dry_matter_yield_kg_dm_ha"
HEIGHT = "sward_height_cm"
GROUP_KEYS = ["farm", "field_code", "pixel_id", "sampling_point_id"]
BUFFER_M = 100.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def haversine_m(lat: float, lon: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    radius_m = 6_371_000.0
    lat1r, lon1r = np.radians(lat), np.radians(lon)
    lat2r, lon2r = np.radians(lat2), np.radians(lon2)
    a = np.sin((lat2r - lat1r) / 2.0) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin((lon2r - lon1r) / 2.0) ** 2
    return 2.0 * radius_m * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def find(parent: dict[tuple[str, str], tuple[str, str]], item: tuple[str, str]) -> tuple[str, str]:
    if parent[item] != item:
        parent[item] = find(parent, parent[item])
    return parent[item]


def union(parent: dict[tuple[str, str], tuple[str, str]], left: tuple[str, str], right: tuple[str, str]) -> None:
    a, b = find(parent, left), find(parent, right)
    if a != b:
        parent[max(a, b)] = min(a, b)


def buffered_folds(frame: pd.DataFrame) -> list[tuple[str, np.ndarray, np.ndarray]]:
    fields = sorted(set(zip(frame["farm"].astype(str), frame["field_code"].astype(str))))
    parent = {field: field for field in fields}
    for _, coordinate_rows in frame.groupby(["farm", "latitude_deg", "longitude_deg"], sort=True):
        aliases = sorted(set(zip(coordinate_rows["farm"].astype(str), coordinate_rows["field_code"].astype(str))))
        for alias in aliases[1:]:
            union(parent, aliases[0], alias)
    roots = {field: find(parent, field) for field in fields}
    block_ids = ["/".join(roots[(str(farm), str(field))]) for farm, field in zip(frame["farm"], frame["field_code"])]
    frame = frame.copy()
    frame["_block"] = block_ids
    locations = frame.groupby(["farm", "latitude_deg", "longitude_deg"], as_index=False, sort=True).agg(block=("_block", "first"))

    folds = []
    for block in sorted(frame["_block"].unique()):
        test_mask = frame["_block"].eq(block).to_numpy()
        test_locations = locations[locations["block"] == block]
        train_locations = locations[locations["block"] != block]
        keep: list[bool] = []
        for location in train_locations.itertuples(index=False):
            distances = haversine_m(location.latitude_deg, location.longitude_deg,
                                    test_locations["latitude_deg"].to_numpy(dtype=float),
                                    test_locations["longitude_deg"].to_numpy(dtype=float))
            keep.append(float(np.min(distances)) >= BUFFER_M)
        allowed = set(zip(train_locations.loc[keep, "farm"].astype(str),
                          train_locations.loc[keep, "latitude_deg"], train_locations.loc[keep, "longitude_deg"]))
        train_mask = np.array([
            frame["_block"].iloc[i] != block and
            (str(farm), lat, lon) in allowed
            for i, (farm, lat, lon) in enumerate(zip(frame["farm"], frame["latitude_deg"], frame["longitude_deg"]))
        ], dtype=bool)
        if not test_mask.any() or not train_mask.any():
            continue
        folds.append((block, train_mask, test_mask))
    return folds


def candidate_models() -> dict[str, object]:
    return {
        "M1_ols": LinearRegression(),
        "M2_ridge": make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
        "M3_huber": HuberRegressor(epsilon=1.35, alpha=0.0, max_iter=1000),
        "M4_quadratic": make_pipeline(StandardScaler(), PolynomialFeatures(degree=2, include_bias=False), LinearRegression()),
    }


def metric_values(y: np.ndarray, pred: np.ndarray) -> dict[str, float | int]:
    return {
        "rows": int(len(y)),
        "maeKgDmHa": float(mean_absolute_error(y, pred)),
        "rmseKgDmHa": float(np.sqrt(mean_squared_error(y, pred))),
        "biasPredictedMinusObservedKgDmHa": float(np.mean(pred - y)),
    }


def subgroup_metrics(frame: pd.DataFrame, pred_col: str, subgroup_cols: list[str], min_groups: int = 0) -> list[dict]:
    results = []
    for key, group in frame.groupby(subgroup_cols, dropna=False, sort=True):
        groups = int(group["spatial_block"].nunique()) if "spatial_block" in group else None
        if groups is not None and groups < min_groups:
            continue
        if not isinstance(key, tuple):
            key = (key,)
        results.append({**dict(zip(subgroup_cols, [str(item) for item in key])),
                        "spatialBlocks": groups,
                        **metric_values(group["observed"].to_numpy(float), group[pred_col].to_numpy(float))})
    return results


def main() -> None:
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    if protocol["status"] != "preregistered_and_evaluation_completed" or protocol["developmentValidation"]["trainingBufferMeters"] != BUFFER_M:
        raise ValueError("protocol status or buffer differs from the frozen design")
    mendeley = pd.read_parquet(MEND)
    required = {*GROUP_KEYS, "campaign", "farm", "field_code", "sward_height_cm", TARGET, "latitude_deg", "longitude_deg", "management_type"}
    missing = sorted(required - set(mendeley.columns))
    if missing:
        raise ValueError(f"Mendeley input missing columns: {missing}")
    mendeley = mendeley.dropna(subset=[*GROUP_KEYS, "campaign", HEIGHT, TARGET, "latitude_deg", "longitude_deg"]).copy()
    if len(mendeley) != protocol["developmentCohort"]["rows"]:
        raise ValueError(f"development row count changed: {len(mendeley)}")
    folds = buffered_folds(mendeley)
    expected_blocks = protocol["developmentValidation"]["expectedBlocks"]
    coverage = sum(int(test.sum()) for _, _, test in folds) / len(mendeley)
    if len(folds) < protocol["developmentValidation"]["minimumNonemptyHeldOutBlocks"] or len(folds) != expected_blocks:
        raise ValueError(f"observed fold count {len(folds)} differs from frozen design {expected_blocks}")
    if coverage < protocol["developmentValidation"]["minimumScoredCoverage"]:
        raise ValueError(f"buffered CV coverage {coverage:.3f} is below the frozen gate")

    dev_columns = list(dict.fromkeys([*GROUP_KEYS, "campaign", "farm", "field_code", "management_type", HEIGHT, TARGET]))
    dev = mendeley[dev_columns].copy()
    dev["spatial_block"] = ""
    dev["observed"] = dev[TARGET].astype(float)
    candidates = candidate_models()
    for model_id in ["M0_median", *candidates]:
        dev[model_id] = np.nan
    dev["fold"] = ""
    fold_reports = []

    for block, train_mask, test_mask in folds:
        train = dev.loc[train_mask]
        test = dev.loc[test_mask]
        train_y = train["observed"].to_numpy(float)
        test_y = test["observed"].to_numpy(float)
        dev.loc[test.index, "fold"] = block
        dev.loc[test.index, "spatial_block"] = block
        dev.loc[test.index, "M0_median"] = float(np.median(train_y))
        fold_entry = {"heldOutBlock": block, "trainRows": int(len(train)), "testRows": int(len(test)),
                      "trainCoordinateGroups": int(train[["farm", "field_code", "pixel_id", "sampling_point_id"]].drop_duplicates().shape[0]),
                      "testCoordinateGroups": int(test[["farm", "field_code", "pixel_id", "sampling_point_id"]].drop_duplicates().shape[0]),
                      "farm": sorted(test["farm"].astype(str).unique().tolist()),
                      "campaigns": sorted(test["campaign"].astype(str).unique().tolist()), "models": {}}
        for model_id, model in candidates.items():
            model.fit(train[[HEIGHT]].to_numpy(float), train_y)
            prediction = model.predict(test[[HEIGHT]].to_numpy(float)).astype(float)
            dev.loc[test.index, model_id] = prediction
            fold_entry["models"][model_id] = metric_values(test_y, prediction)
        fold_entry["models"]["M0_median"] = metric_values(test_y, np.repeat(np.median(train_y), len(test_y)))
        fold_reports.append(fold_entry)

    prediction_cols = ["M0_median", *candidates]
    if dev[prediction_cols].isna().any(axis=None):
        raise ValueError("one or more eligible development rows lack OOF predictions")
    dev_metrics = {}
    for model_id in prediction_cols:
        row = metric_values(dev["observed"].to_numpy(float), dev[model_id].to_numpy(float))
        per_block = [mean_absolute_error(g["observed"], g[model_id]) for _, g in dev.groupby("fold", sort=True)]
        row["blockMacroMaeKgDmHa"] = float(np.mean(per_block))
        dev_metrics[model_id] = row

    ols = dev_metrics["M1_ols"]
    selection = []
    eligible_challengers = []
    for model_id in ["M2_ridge", "M3_huber", "M4_quadratic"]:
        result = dev_metrics[model_id]
        mae_reduction = (ols["blockMacroMaeKgDmHa"] - result["blockMacroMaeKgDmHa"]) / ols["blockMacroMaeKgDmHa"]
        rmse_change = (result["rmseKgDmHa"] - ols["rmseKgDmHa"]) / ols["rmseKgDmHa"]
        farm_rows = subgroup_metrics(dev, model_id, ["farm"], min_groups=20)
        ols_farm = {r["farm"]: r for r in subgroup_metrics(dev, "M1_ols", ["farm"], min_groups=20)}
        farm_gate = all((r["maeKgDmHa"] - ols_farm[r["farm"]]["maeKgDmHa"]) / max(ols_farm[r["farm"]]["maeKgDmHa"], 1e-12) <= 0.10 for r in farm_rows)
        campaign_rows = subgroup_metrics(dev, model_id, ["campaign"], min_groups=20)
        ols_campaign = {r["campaign"]: r for r in subgroup_metrics(dev, "M1_ols", ["campaign"], min_groups=20)}
        campaign_gate = all((r["maeKgDmHa"] - ols_campaign[r["campaign"]]["maeKgDmHa"]) / max(ols_campaign[r["campaign"]]["maeKgDmHa"], 1e-12) <= 0.10 for r in campaign_rows)
        is_external_aggregation_compatible = model_id != "M4_quadratic"
        passed = (is_external_aggregation_compatible and mae_reduction >= 0.10 and
                  rmse_change <= 0.05 and farm_gate and campaign_gate)
        selection.append({"candidate": model_id, "blockMacroMaeReductionVsOls": mae_reduction,
                          "rowWeightedRmseChangeVsOls": rmse_change, "farmSubgroupGate": farm_gate,
                          "campaignSubgroupGate": campaign_gate,
                          "aggregationCompatibleWithExternalMeanHeight": is_external_aggregation_compatible,
                          "eligibleForSelection": passed})
        if passed:
            eligible_challengers.append(model_id)
    selected = min(eligible_challengers, key=lambda mid: dev_metrics[mid]["blockMacroMaeKgDmHa"]) if eligible_challengers else "M1_ols"

    final_model = candidate_models()[selected]
    final_model.fit(dev[[HEIGHT]].to_numpy(float), dev["observed"].to_numpy(float))
    dryad = pd.read_parquet(DRYAD)
    expected_dryad_rows = protocol["externalEvaluation"]["rows"]
    ext_required = {"paddockId", "treatment", "calendarYear", "julianDay", "preGrazingForageMassMeanKgPerHa", "preGrazingHeightMeanCm"}
    if ext_required - set(dryad.columns) or len(dryad) != expected_dryad_rows:
        raise ValueError("Dryad external cohort schema or row count differs from frozen protocol")
    ext = dryad.copy()
    ext["observed"] = ext["preGrazingForageMassMeanKgPerHa"].astype(float)
    ext["heightCm"] = ext["preGrazingHeightMeanCm"].astype(float)
    ext["supportStatus"] = np.where(ext["heightCm"].between(*protocol["developmentCohort"]["heightSupportCm"]), "in_support", "above_support")
    ext["prediction"] = final_model.predict(ext[["heightCm"]].rename(columns={"heightCm": HEIGHT}).to_numpy(float))
    ext["selectedModel"] = selected

    DEV_DIR.mkdir(parents=True, exist_ok=True)
    EXT_DIR.mkdir(parents=True, exist_ok=True)
    dev_path = DEV_DIR / "buffered-spatial-oof-predictions.csv"
    ext_path = EXT_DIR / "dryad-external-predictions.csv"
    dev_export = dev[["spatial_block", "fold", "farm", "campaign", "sward_height_cm", "observed", *prediction_cols]].copy()
    dev_export.to_csv(dev_path, index=False, float_format="%.8f", lineterminator="\n")
    ext_export = ext[["paddockId", "replicate", "treatment", "calendarYear", "julianDay", "nQuadratSamples", "heightCm", "supportStatus", "observed", "prediction", "selectedModel"]]
    ext_export.to_csv(ext_path, index=False, float_format="%.8f", lineterminator="\n")

    ext_summary = {"allRows": metric_values(ext["observed"].to_numpy(float), ext["prediction"].to_numpy(float)),
                   "inSupport": metric_values(*[ext.loc[ext["supportStatus"] == "in_support", col].to_numpy(float) for col in ("observed", "prediction")]),
                   "aboveSupport": metric_values(*[ext.loc[ext["supportStatus"] == "above_support", col].to_numpy(float) for col in ("observed", "prediction")]),
                   "paddockMacroMaeKgDmHa": float(ext.groupby("paddockId").apply(lambda g: mean_absolute_error(g["observed"], g["prediction"]), include_groups=False).mean()),
                   "byPaddock": subgroup_metrics(ext.rename(columns={"paddockId": "spatial_block"}), "prediction", ["spatial_block"]),
                   "byTreatment": subgroup_metrics(ext, "prediction", ["treatment"]),
                   "byCalendarYear": subgroup_metrics(ext, "prediction", ["calendarYear"]),
                   "byJulianDay": subgroup_metrics(ext, "prediction", ["julianDay"]),
                   "bySupportStatus": subgroup_metrics(ext, "prediction", ["supportStatus"])}
    report = {
        "schemaVersion": "1.0.0", "status": "completed_frozen_development_cv_and_single_external_cohort_evaluation",
        "protocol": str(PROTOCOL.relative_to(ROOT)), "protocolSha256": sha256(PROTOCOL),
        "inputs": {"mendeley": {"path": str(MEND.relative_to(ROOT)), "sha256": sha256(MEND), "rows": len(dev)},
                   "dryad": {"path": str(DRYAD.relative_to(ROOT)), "sha256": sha256(DRYAD), "rows": len(ext)}},
        "software": {"scikitLearn": sklearn.__version__},
        "development": {"design": "13 connected farm/field-component holdouts with exact-coordinate aliases joined and 100 m great-circle training buffer",
                        "coverage": coverage, "blocks": len(folds), "models": dev_metrics, "selectionAgainstOls": selection,
                        "selectedFinalModel": selected, "folds": fold_reports,
                        "farmMetricsSelected": subgroup_metrics(dev, selected, ["farm"]),
                        "campaignMetricsSelected": subgroup_metrics(dev, selected, ["campaign"])},
        "external": {"sourceDoi": protocol["externalEvaluation"]["sourceDoi"], "selectedModel": selected,
                     "modelFitRows": int(len(dev)), "outcomesUsedForSelection": False,
                     "metrics": ext_summary, "heightSupportCm": protocol["developmentCohort"]["heightSupportCm"],
                     "supportCounts": {str(k): int(v) for k, v in ext["supportStatus"].value_counts().items()}},
        "artifacts": {"developmentPredictions": {"path": str(dev_path.relative_to(ROOT)), "sha256": sha256(dev_path)},
                      "externalPredictions": {"path": str(ext_path.relative_to(ROOT)), "sha256": sha256(ext_path)}},
        "limits": ["13 spatial blocks are nested in two Brazilian farms; development CV does not estimate new-farm performance.",
                   "Mendeley confirms that height and biomass were measured at the same points in the later two campaigns, but does not specify the measurement order relative to clipping; its target is therefore not called pre-grazing.",
                   "Dryad's pre-grazing outcome and height form a related but not strictly identical sampling estimand to Mendeley; the selected affine OLS model is compatible with the matched aggregate mean height.",
                   "Only 40/64 Dryad rows are within the 2–56 cm Mendeley support, and only 51/234 Mendeley rows lie in that interval. All 24 above-support Dryad rows are MOB, confounding support status with treatment and year.",
                   "Dryad is a distinct temperate US pasture cohort with only eight repeated paddock groups.",
                   "This result concerns forage biomass only and does not validate DMI, ADG, animal behavior, pasture inventory, or the full engine.",
                   "No confidence interval or calibrated prediction interval is claimed."],
    }
    json_path = EXT_DIR / "evaluation-report.json"
    md_path = EXT_DIR / "evaluation-report.md"
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({"report": str(md_path.relative_to(ROOT)), "selectedModel": selected,
                      "developmentModels": dev_metrics, "externalMetrics": ext_summary["allRows"],
                      "coverage": coverage, "dryadOutcomesUsedForSelection": False}, indent=2, allow_nan=False))


def render_markdown(report: dict) -> str:
    dev = report["development"]
    ext = report["external"]
    lines = ["# Mendeley spatial CV and Dryad external biomass evaluation", "",
             "**Status:** evaluation complete under the frozen protocol. Dryad outcomes were used once for reporting and not for model selection.", "",
             f"Selected model: **{dev['selectedFinalModel']}**. Buffered development CV: {dev['blocks']} blocks, {dev['coverage']:.1%} row coverage.", "",
             "## Buffered development CV", "", "| Candidate | Pooled MAE | Block macro MAE | RMSE | Bias |", "|---|---:|---:|---:|---:|"]
    for model, metrics in dev["models"].items():
        lines.append(f"| {model} | {metrics['maeKgDmHa']:.1f} | {metrics['blockMacroMaeKgDmHa']:.1f} | {metrics['rmseKgDmHa']:.1f} | {metrics['biasPredictedMinusObservedKgDmHa']:.1f} |")
    lines += ["", "## One-time Dryad external evaluation", "",
              f"Selected model: **{ext['selectedModel']}**; source DOI `{ext['sourceDoi']}`; rows {ext['metrics']['allRows']['rows']}; paddock groups 8.", "",
              "| Stratum | Rows | MAE | RMSE | Bias |", "|---|---:|---:|---:|---:|"]
    for label, metrics in [("All rows", ext["metrics"]["allRows"]), ("In support", ext["metrics"]["inSupport"]), ("Above support (extrapolation)", ext["metrics"]["aboveSupport"])]:
        lines.append(f"| {label} | {metrics['rows']} | {metrics['maeKgDmHa']:.1f} | {metrics['rmseKgDmHa']:.1f} | {metrics['biasPredictedMinusObservedKgDmHa']:.1f} |")
    lines += ["", f"Paddock-macro MAE: **{ext['metrics']['paddockMacroMaeKgDmHa']:.1f} kg DM/ha**.", "",
              "The 13 spatial blocks belong to two farms; the independent Dryad cohort has only eight repeated paddocks and a temperate US forage system. These results concern biomass alone and do not establish new-farm generalization, DMI, ADG, behavior, inventory, or full-engine validity. No calibrated interval or population-level confidence interval is claimed.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
