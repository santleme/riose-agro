#!/usr/bin/env python3
"""Nested, spatially buffered development comparison for height-only biomass models.

This is exploratory model development on the already reviewed Mendeley cohort.
It never reads the Dryad evaluation data and writes to a separate experiment
directory so the historical baseline and one-time external report stay frozen.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import platform
import subprocess
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parents[3]
_BASELINE_SPEC = importlib.util.spec_from_file_location(
    "evaluate_mendeley_dryad_biomass", ROOT / "scripts/science/evaluations/evaluate_mendeley_dryad_biomass.py"
)
assert _BASELINE_SPEC and _BASELINE_SPEC.loader
_BASELINE = importlib.util.module_from_spec(_BASELINE_SPEC)
_BASELINE_SPEC.loader.exec_module(_BASELINE)
BUFFER_M = _BASELINE.BUFFER_M
GROUP_KEYS = _BASELINE.GROUP_KEYS
HEIGHT = _BASELINE.HEIGHT
MEND = _BASELINE.MEND
TARGET = _BASELINE.TARGET
buffered_folds = _BASELINE.buffered_folds


PROTOCOL = ROOT / "experiments/diagnostics/biomass/preregister-nested-height-models-2026-10.json"
OUT_DIR = ROOT / "experiments/biomass/nested-development-2026-10"
PREDICTIONS = OUT_DIR / "outer-oof-predictions.csv"
REPORT_JSON = OUT_DIR / "evaluation-report.json"
REPORT_MD = OUT_DIR / "evaluation-report.md"
SEED = 20261013
MODEL_IDS = ["M0_median", "M1_ols", "M5_isotonic", "M6_rf_monotone", "M7_hgb_monotone"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_model(model_id: str) -> Any:
    if model_id == "M1_ols":
        return LinearRegression()
    if model_id == "M5_isotonic":
        return IsotonicRegression(increasing=True, out_of_bounds="clip")
    if model_id == "M6_rf_monotone":
        return RandomForestRegressor(
            n_estimators=100,
            max_depth=3,
            min_samples_leaf=10,
            max_features=1.0,
            bootstrap=True,
            monotonic_cst=[1],
            n_jobs=1,
            random_state=SEED,
        )
    if model_id == "M7_hgb_monotone":
        return HistGradientBoostingRegressor(
            max_iter=50,
            learning_rate=0.05,
            max_leaf_nodes=3,
            min_samples_leaf=15,
            l2_regularization=1.0,
            monotonic_cst=[1],
            early_stopping=False,
            random_state=SEED,
        )
    if model_id == "M0_median":
        return None
    raise ValueError(f"unknown candidate: {model_id}")


def fit_predict(model_id: str, train: pd.DataFrame, test: pd.DataFrame,
                runtime: dict[str, dict[str, float]]) -> np.ndarray:
    y_train = train[TARGET].to_numpy(dtype=float)
    if model_id == "M0_median":
        runtime[model_id]["predictionRows"] += len(test)
        return np.repeat(float(np.median(y_train)), len(test))
    model = make_model(model_id)
    x_train = train[[HEIGHT]].to_numpy(dtype=float)
    x_test = test[[HEIGHT]].to_numpy(dtype=float)
    started = time.perf_counter()
    model.fit(x_train, y_train)
    runtime[model_id]["fitSeconds"] += time.perf_counter() - started
    started = time.perf_counter()
    prediction = np.asarray(model.predict(x_test), dtype=float)
    runtime[model_id]["predictSeconds"] += time.perf_counter() - started
    runtime[model_id]["predictionRows"] += len(test)
    if prediction.shape != (len(test),) or not np.isfinite(prediction).all():
        raise ValueError(f"{model_id} produced invalid predictions")
    return prediction


def metrics(y: np.ndarray, prediction: np.ndarray) -> dict[str, float | int]:
    if len(y) != len(prediction) or len(y) == 0:
        raise ValueError("metrics require non-empty, aligned vectors")
    return {
        "rows": int(len(y)),
        "maeKgDmHa": float(mean_absolute_error(y, prediction)),
        "rmseKgDmHa": float(np.sqrt(mean_squared_error(y, prediction))),
        "biasPredictedMinusObservedKgDmHa": float(np.mean(prediction - y)),
    }


def subgroup_metrics(frame: pd.DataFrame, prediction_column: str,
                     subgroup_column: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for key, group in frame.groupby(subgroup_column, dropna=False, sort=True):
        result.append({
            subgroup_column: str(key),
            "outerBlocks": int(group["outer_block"].nunique()),
            **metrics(group["observed"].to_numpy(float), group[prediction_column].to_numpy(float)),
        })
    return result


def preflight(frame: pd.DataFrame, outer_folds: list[tuple[str, np.ndarray, np.ndarray]],
              protocol: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate all nested split coverage before fitting any candidate."""
    inner_spec = protocol["design"]["inner"]
    details = []
    for outer_id, outer_train_mask, outer_test_mask in outer_folds:
        outer_train = frame.loc[outer_train_mask].reset_index(drop=True)
        outer_test = frame.loc[outer_test_mask]
        inner_folds = buffered_folds(outer_train)
        n_scored = sum(int(test_mask.sum()) for _, _, test_mask in inner_folds)
        coverage = n_scored / len(outer_train) if len(outer_train) else 0.0
        nonempty = [int(test_mask.sum()) for _, _, test_mask in inner_folds if test_mask.any()]
        train_counts = [int(train_mask.sum()) for _, train_mask, test_mask in inner_folds if test_mask.any()]
        if len(inner_folds) < inner_spec["minimumNonemptyFolds"]:
            raise RuntimeError(f"stop: {outer_id} has only {len(inner_folds)} inner folds")
        if coverage < inner_spec["minimumScoredCoverage"]:
            raise RuntimeError(f"stop: {outer_id} inner coverage is {coverage:.3f}")
        if not nonempty or not train_counts or min(train_counts) <= 0:
            raise RuntimeError(f"stop: {outer_id} has empty inner validation or training data")
        if len(inner_folds) < inner_spec["expectedNonemptyFoldsPerOuterTrainingSet"]:
            raise RuntimeError(f"stop: {outer_id} has fewer inner folds than the recorded feature-only preflight")
        details.append({
            "outerBlock": outer_id,
            "outerTrainRows": int(len(outer_train)),
            "outerTestRows": int(len(outer_test)),
            "innerFolds": len(inner_folds),
            "innerScoredRows": n_scored,
            "innerCoverage": coverage,
            "innerTestRowsByBlock": nonempty,
            "minimumInnerTrainingRows": min(train_counts),
            "innerBlockIds": [block for block, _, test_mask in inner_folds if test_mask.any()],
        })
    return details


def git_state() -> dict[str, Any]:
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    status = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return {"head": head, "workingTreeDirty": bool(status.strip())}


def build_report() -> tuple[dict[str, Any], pd.DataFrame, str]:
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    if protocol["status"] != "preregistered_before_candidate_model_fitting":
        raise ValueError("protocol must be preregistered before candidate fitting")
    frame = pd.read_parquet(MEND)
    expected_sha = protocol["developmentCohort"]["sha256"]
    actual_sha = sha256(MEND)
    if actual_sha != expected_sha:
        raise ValueError(f"Mendeley checksum changed: {actual_sha}")
    required = {*GROUP_KEYS, "farm", "field_code", "campaign", HEIGHT, TARGET, "latitude_deg", "longitude_deg"}
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Mendeley input missing columns: {missing}")
    frame = frame.dropna(subset=[*GROUP_KEYS, "campaign", HEIGHT, TARGET, "latitude_deg", "longitude_deg"]).reset_index(drop=True)
    if len(frame) != protocol["developmentCohort"]["rows"]:
        raise ValueError(f"unexpected development rows: {len(frame)}")
    if frame[HEIGHT].isna().any() or not frame[HEIGHT].between(2.0, 56.0).all():
        raise ValueError("feature completeness/support check failed")

    outer_folds = buffered_folds(frame)
    outer_spec = protocol["design"]["outer"]
    if len(outer_folds) != outer_spec["expectedBlocks"]:
        raise RuntimeError(f"stop: expected {outer_spec['expectedBlocks']} outer blocks, found {len(outer_folds)}")
    outer_coverage = sum(int(test_mask.sum()) for _, _, test_mask in outer_folds) / len(frame)
    if outer_coverage < outer_spec["minimumScoredCoverage"]:
        raise RuntimeError(f"stop: outer coverage {outer_coverage:.3f} is below gate")
    preflight_details = preflight(frame, outer_folds, protocol)

    # No model is fitted until every outer and nested split passes the gate.
    runtime = defaultdict(lambda: {"fitSeconds": 0.0, "predictSeconds": 0.0, "predictionRows": 0})
    output = frame[["farm", "campaign", HEIGHT, TARGET]].copy()
    output["observed"] = output[TARGET].astype(float)
    output["outer_block"] = ""
    output["outer_train_rows"] = 0
    output["outer_test_rows"] = 0
    for model_id in MODEL_IDS:
        output[f"{model_id}_prediction"] = np.nan
    output["nested_selected_model"] = ""
    output["nested_selected_prediction"] = np.nan
    nested_details = []
    outer_model_rows: list[dict[str, Any]] = []
    selected_counts: Counter[str] = Counter()

    for outer_id, outer_train_mask, outer_test_mask in outer_folds:
        outer_train = frame.loc[outer_train_mask].reset_index(drop=True)
        outer_test = frame.loc[outer_test_mask]
        test_indices = output.index[outer_test_mask]
        output.loc[test_indices, "outer_block"] = outer_id
        output.loc[test_indices, "outer_train_rows"] = len(outer_train)
        output.loc[test_indices, "outer_test_rows"] = len(outer_test)

        inner_folds = buffered_folds(outer_train)
        inner_maes: dict[str, list[float]] = {model_id: [] for model_id in MODEL_IDS}
        inner_reports = []
        for inner_id, inner_train_mask, inner_test_mask in inner_folds:
            inner_train = outer_train.loc[inner_train_mask]
            inner_test = outer_train.loc[inner_test_mask]
            y_inner = inner_test[TARGET].to_numpy(float)
            model_metrics = {}
            for model_id in MODEL_IDS:
                pred = fit_predict(model_id, inner_train, inner_test, runtime)
                score = metrics(y_inner, pred)
                inner_maes[model_id].append(score["maeKgDmHa"])
                model_metrics[model_id] = score
            inner_reports.append({
                "heldOutInnerBlock": inner_id,
                "trainRows": int(len(inner_train)),
                "testRows": int(len(inner_test)),
                "testGroups": sorted(inner_test["farm"].astype(str).unique().tolist()),
                "metrics": model_metrics,
            })
        if any(len(inner_maes[mid]) != len(inner_folds) for mid in MODEL_IDS):
            raise RuntimeError(f"candidate inner coverage mismatch in {outer_id}")
        inner_macro = {mid: float(np.mean(inner_maes[mid])) for mid in MODEL_IDS}
        selected = min(MODEL_IDS, key=lambda mid: inner_macro[mid])
        selected_counts[selected] += 1

        y_test = outer_test[TARGET].to_numpy(float)
        fixed_predictions = {}
        fixed_metrics = {}
        for model_id in MODEL_IDS:
            prediction = fit_predict(model_id, outer_train, outer_test, runtime)
            fixed_predictions[model_id] = prediction
            output.loc[test_indices, f"{model_id}_prediction"] = prediction
            fixed_metrics[model_id] = metrics(y_test, prediction)
        output.loc[test_indices, "nested_selected_model"] = selected
        output.loc[test_indices, "nested_selected_prediction"] = fixed_predictions[selected]
        selected_metrics = metrics(y_test, fixed_predictions[selected])
        outer_model_rows.append({"outerBlock": outer_id, "metrics": fixed_metrics})
        nested_details.append({
            "outerBlock": outer_id,
            "outerTrainRows": int(len(outer_train)),
            "outerTestRows": int(len(outer_test)),
            "innerCandidateEqualBlockMaeKgDmHa": inner_macro,
            "selectedCandidate": selected,
            "outerNestedSelectedMetrics": selected_metrics,
            "innerFolds": inner_reports,
        })

    prediction_columns = [f"{model_id}_prediction" for model_id in MODEL_IDS] + ["nested_selected_prediction"]
    if output[prediction_columns].isna().any(axis=None) or (output["outer_block"] == "").any():
        raise RuntimeError("outer predictions do not cover all eligible rows")
    y = output["observed"].to_numpy(float)
    summaries = {}
    for model_id in MODEL_IDS:
        col = f"{model_id}_prediction"
        result = metrics(y, output[col].to_numpy(float))
        per_block = output.assign(_abs_error=(output[col] - output["observed"]).abs()).groupby("outer_block")["_abs_error"].mean()
        result["equalBlockMaeKgDmHa"] = float(per_block.mean())
        summaries[model_id] = result
    nested_result = metrics(y, output["nested_selected_prediction"].to_numpy(float))
    nested_block_mae = output.assign(_abs_error=(output["nested_selected_prediction"] - output["observed"]).abs()).groupby("outer_block")["_abs_error"].mean()
    nested_result["equalBlockMaeKgDmHa"] = float(nested_block_mae.mean())

    # Gate the nested selection procedure against OLS; subgroup metrics use the identical OOF rows.
    ols = summaries["M1_ols"]
    relative_mae_reduction = (ols["equalBlockMaeKgDmHa"] - nested_result["equalBlockMaeKgDmHa"]) / ols["equalBlockMaeKgDmHa"]
    relative_rmse_change = (nested_result["rmseKgDmHa"] - ols["rmseKgDmHa"]) / ols["rmseKgDmHa"]
    nested_farm = subgroup_metrics(output, "nested_selected_prediction", "farm")
    ols_farm = {row["farm"]: row for row in subgroup_metrics(output, "M1_ols_prediction", "farm")}
    nested_campaign = subgroup_metrics(output, "nested_selected_prediction", "campaign")
    ols_campaign = {row["campaign"]: row for row in subgroup_metrics(output, "M1_ols_prediction", "campaign")}
    farm_gate = all((row["maeKgDmHa"] - ols_farm[row["farm"]]["maeKgDmHa"]) / max(ols_farm[row["farm"]]["maeKgDmHa"], 1e-12) <= 0.10 for row in nested_farm)
    campaign_gate = all((row["maeKgDmHa"] - ols_campaign[row["campaign"]]["maeKgDmHa"]) / max(ols_campaign[row["campaign"]]["maeKgDmHa"], 1e-12) <= 0.10 for row in nested_campaign)
    bias_gate = abs(nested_result["biasPredictedMinusObservedKgDmHa"]) <= abs(ols["biasPredictedMinusObservedKgDmHa"]) + 100.0
    advancement = {
        "relativeEqualBlockMaeReductionVsOls": relative_mae_reduction,
        "relativePooledRmseChangeVsOls": relative_rmse_change,
        "absoluteBiasWithinOlsPlus100KgDmHa": bias_gate,
        "farmSubgroupGate": farm_gate,
        "campaignSubgroupGate": campaign_gate,
        "allCriteriaPass": bool(relative_mae_reduction >= 0.10 and relative_rmse_change <= 0.05 and bias_gate and farm_gate and campaign_gate),
        "decision": "DEVELOPMENT_CANDIDATE_ADVANCES_TO_FUTURE_PREREGISTERED_TEST_ONLY" if relative_mae_reduction >= 0.10 and relative_rmse_change <= 0.05 and bias_gate and farm_gate and campaign_gate else "NO_ADVANCEMENT_RETAIN_OLS_AS_DEVELOPMENT_REFERENCE",
    }
    subgroup = {
        "nestedSelectedByFarm": nested_farm,
        "olsByFarm": subgroup_metrics(output, "M1_ols_prediction", "farm"),
        "nestedSelectedByCampaign": nested_campaign,
        "olsByCampaign": subgroup_metrics(output, "M1_ols_prediction", "campaign"),
    }
    per_block = []
    for outer_id, group in output.groupby("outer_block", sort=True):
        row = {"outerBlock": str(outer_id), "rows": len(group), "farms": sorted(group["farm"].astype(str).unique().tolist()), "campaigns": sorted(group["campaign"].astype(str).unique().tolist())}
        row["nestedSelected"] = metrics(group["observed"].to_numpy(float), group["nested_selected_prediction"].to_numpy(float))
        row["M0_median"] = metrics(group["observed"].to_numpy(float), group["M0_median_prediction"].to_numpy(float))
        row["M1_ols"] = metrics(group["observed"].to_numpy(float), group["M1_ols_prediction"].to_numpy(float))
        per_block.append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_bytes = output.to_csv(index=False, float_format="%.8f", lineterminator="\n").encode("utf-8")
    PREDICTIONS.write_bytes(csv_bytes)
    protocol_sha = sha256(PROTOCOL)
    report = {
        "schemaVersion": "1.0.0",
        "status": "completed_exploratory_nested_development_not_independent_validation",
        "protocol": str(PROTOCOL.relative_to(ROOT)),
        "protocolSha256": protocol_sha,
        "provenance": {
            "dataPath": str(MEND.relative_to(ROOT)),
            "dataSha256": actual_sha,
            "dataRows": len(frame),
            "codePath": "scripts/science/evaluations/evaluate_biomass_nested_development.py",
            "codeSha256": sha256(Path(__file__)),
            "git": git_state(),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
            "scikitLearn": sklearn.__version__,
            "randomSeed": SEED,
            "features": [HEIGHT],
            "target": TARGET,
            "targetUnit": "kg DM/ha",
        },
        "preflight": {
            "outerBlocks": len(outer_folds),
            "outerScoredRows": int(sum(int(te.sum()) for _, _, te in outer_folds)),
            "outerCoverage": outer_coverage,
            "innerFoldsPerOuterMin": min(item["innerFolds"] for item in preflight_details),
            "innerFoldsPerOuterMax": max(item["innerFolds"] for item in preflight_details),
            "innerCoverageMin": min(item["innerCoverage"] for item in preflight_details),
            "minimumInnerTrainingRows": min(item["minimumInnerTrainingRows"] for item in preflight_details),
            "folds": preflight_details,
            "allGatesPassedBeforeFit": True,
        },
        "candidateModels": protocol["candidateSet"],
        "selection": {
            "innerPrimaryMetric": protocol["nestedSelection"]["innerPrimaryMetric"],
            "selectedFrequencyByOuterBlock": dict(sorted(selected_counts.items())),
            "detailsByOuterBlock": nested_details,
        },
        "outerOof": {
            "rows": len(output),
            "coverage": float(len(output) / len(frame)),
            "metricsByFixedCandidate": summaries,
            "nestedSelectedProcedure": nested_result,
            "metricsByFarmAndCampaign": subgroup,
            "perOuterBlock": per_block,
            "advancementGate": advancement,
            "fixedCandidateOuterMetricsAreDescriptiveOnly": True,
        },
        "runtime": {
            model_id: {
                "fitSeconds": float(values["fitSeconds"]),
                "predictionSeconds": float(values["predictSeconds"]),
                "predictionRows": int(values["predictionRows"]),
                "predictionMicrosecondsPerRow": float(values["predictSeconds"] * 1_000_000 / max(values["predictionRows"], 1)),
            }
            for model_id, values in runtime.items()
        },
        "artifacts": {
            "predictions": {"path": str(PREDICTIONS.relative_to(ROOT)), "rows": len(output), "sha256": hashlib.sha256(csv_bytes).hexdigest()},
            "jsonReport": str(REPORT_JSON.relative_to(ROOT)),
            "markdownReport": str(REPORT_MD.relative_to(ROOT)),
        },
        "limits": [
            "The candidate family was selected after the prior Mendeley and Dryad results had been reviewed; nested validation does not make the reviewed cohort outcomes pristine.",
            "This run uses only two Brazilian farms and two campaigns, and its 13 spatial blocks are clustered within those farms; the OOF scores are development diagnostics, not external validation or confidence intervals.",
            "Dryad outcomes were not read by this script and were not used for candidate selection, threshold selection, or tuning; its previously reported evaluation is not a new holdout for this post-baseline candidate family.",
            "Height measurement order relative to clipping is undocumented in Mendeley, limiting any operational pre-measurement interpretation.",
            "The outcome is clipped-quadrat forage mass only; results do not validate standing inventory, DMI, ADG, behavior, or the full Riose engine.",
        ],
    }
    REPORT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown = render_markdown(report)
    REPORT_MD.write_text(markdown, encoding="utf-8")
    return report, output, markdown


def render_markdown(report: dict[str, Any]) -> str:
    oof = report["outerOof"]
    lines = [
        "# Exploratory nested development: height-only pasture biomass",
        "",
        "**Status:** post-baseline exploratory development; not independent validation. The candidate family was selected after earlier Mendeley and Dryad outcomes had already been reviewed. Dryad outcomes were not used by this experiment.",
        "",
        f"Development rows: {oof['rows']}; outer blocks: {report['preflight']['outerBlocks']}; coverage: {oof['coverage']:.1%}.",
        "",
        "## Outer OOF metrics on the same rows",
        "",
        "| Candidate | MAE | Equal-block MAE | RMSE | Bias |",
        "|---|---:|---:|---:|---:|",
    ]
    for model_id, values in oof["metricsByFixedCandidate"].items():
        lines.append(f"| {model_id} | {values['maeKgDmHa']:.1f} | {values['equalBlockMaeKgDmHa']:.1f} | {values['rmseKgDmHa']:.1f} | {values['biasPredictedMinusObservedKgDmHa']:.1f} |")
    values = oof["nestedSelectedProcedure"]
    lines.append(f"| Nested-selected per block | {values['maeKgDmHa']:.1f} | {values['equalBlockMaeKgDmHa']:.1f} | {values['rmseKgDmHa']:.1f} | {values['biasPredictedMinusObservedKgDmHa']:.1f} |")
    lines.extend(["", "## Selection and advancement", "", f"Nested selection frequency: `{json.dumps(report['selection']['selectedFrequencyByOuterBlock'], sort_keys=True)}`.", "", f"Decision: **{oof['advancementGate']['decision']}**. Relative equal-block MAE reduction vs OLS: {oof['advancementGate']['relativeEqualBlockMaeReductionVsOls']:.1%}; relative RMSE change: {oof['advancementGate']['relativePooledRmseChangeVsOls']:.1%}; bias gate: {oof['advancementGate']['absoluteBiasWithinOlsPlus100KgDmHa']}; farm gate: {oof['advancementGate']['farmSubgroupGate']}; campaign gate: {oof['advancementGate']['campaignSubgroupGate']}.", "", "## Scope", "", *[f"- {item}" for item in report["limits"]], "", "## Reproduction", "", "```bash", "uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python scripts/science/evaluations/evaluate_biomass_nested_development.py", "uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python -m unittest tests.test_biomass_nested_development -v", "```", ""])
    return "\n".join(lines)


def main() -> None:
    report, _, _ = build_report()
    print(json.dumps({
        "status": report["status"],
        "output": report["artifacts"],
        "metrics": report["outerOof"]["metricsByFixedCandidate"],
        "nestedSelected": report["outerOof"]["nestedSelectedProcedure"],
        "advancementGate": report["outerOof"]["advancementGate"],
    }, indent=2))


if __name__ == "__main__":
    main()
