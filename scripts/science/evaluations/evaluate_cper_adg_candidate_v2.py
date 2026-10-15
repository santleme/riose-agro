#!/usr/bin/env python3
"""Nested year-blocked CPER ADG candidate comparison v2.

Reads only the CPER 2009-2013 yearling-steer rows. No CGREC outcome is read.
The mechanical simulator is evaluated separately as a duration-conditioned
descriptive benchmark and is excluded from candidate selection.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
import subprocess
import sys
import time
import warnings
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import HuberRegressor, LinearRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[3]
EXP = ROOT / "experiments/diagnostics/adg/cper-candidate-v2"
PROTOCOL = EXP / "preregister.json"
SOURCE = ROOT / "data/usda-cper-ltgi-2000-2019/LTGI_2000-2019_all_weights_published.csv"
MANIFEST = ROOT / "data/usda-cper-ltgi-2000-2019/manifest.json"
YEARS = (2009, 2010, 2011, 2012, 2013)
LB_TO_KG = 0.45359237
SEED = 20261013

GRIDS = {
    "M2": [(a,) for a in (0.01, 0.1, 1.0, 10.0)],
    "M3": [(eps, alpha) for eps in (1.1, 1.35, 1.5) for alpha in (0.0001, 0.01)],
    "M4": [(depth, leaf) for depth in (2, 3) for leaf in (5, 10)],
    "M5": [(leaves, reg) for leaves in (3, 5) for reg in (1.0, 10.0)],
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_cohort() -> tuple[list[dict], dict]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    source_bytes = SOURCE.read_bytes()
    digest = sha256(source_bytes)
    entry = next(f for f in manifest["files"] if f["name"] == SOURCE.name)
    if digest != entry["sha256"]:
        raise ValueError("CPER source checksum differs from checked-in manifest")
    rows = []
    with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Year", "Type", "Pasture", "Treatment", "Owner", "Tag.Color", "Tag",
                    "Season.Days", "on_Weight", "off_Weight", "Use.Flag"}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Missing required columns: {sorted(required - set(reader.fieldnames or []))}")
        for raw in reader:
            try:
                year = int(raw["Year"])
            except (TypeError, ValueError):
                continue
            if year not in YEARS or raw["Type"].strip().lower() != "steer":
                continue
            days, initial_lb, final_lb = (float(raw[key]) for key in ("Season.Days", "on_Weight", "off_Weight"))
            if not all(math.isfinite(value) and value > 0 for value in (days, initial_lb, final_lb)):
                raise ValueError(f"Invalid source measurement in year {year}")
            owner, tag_color, tag = (raw[key].strip() for key in ("Owner", "Tag.Color", "Tag"))
            if not all((owner, tag_color, tag)):
                raise ValueError(f"Missing identity proxy in year {year}")
            pasture, treatment = raw["Pasture"].strip(), raw["Treatment"].strip().lower()
            rows.append({
                "row_id": f"{year}|{pasture}|{owner}|{tag_color}|{tag}",
                "year": year, "identity": f"{owner}|{tag_color}|{tag}",
                "pasture": pasture, "treatment": treatment,
                "use_flag": raw["Use.Flag"].strip() or "(missing)",
                "initial_weight_kg": initial_lb * LB_TO_KG,
                "season_days": days,
                "observed": (final_lb - initial_lb) * LB_TO_KG / days,
            })
    if len(rows) != 320 or len({row["row_id"] for row in rows}) != len(rows):
        raise ValueError(f"Expected 320 unique CPER animal-season rows, found {len(rows)}")
    return rows, {"sha256": digest, "bytes": len(source_bytes), "doi": manifest["doi"], "license": manifest["license"]}


def split_year(rows: list[dict], year: int) -> tuple[list[dict], list[dict], int]:
    test = [row for row in rows if row["year"] == year]
    ids = {row["identity"] for row in test}
    train_all = [row for row in rows if row["year"] != year]
    train = [row for row in train_all if row["identity"] not in ids]
    purged = len({row["identity"] for row in train_all if row["identity"] in ids})
    if not train or not test or {r["identity"] for r in train} & ids:
        raise ValueError(f"Invalid identity-purged split for {year}")
    return train, test, purged


def model(model_id: str, params: tuple = ()):
    if model_id == "M1":
        return make_pipeline(StandardScaler(), LinearRegression())
    if model_id == "M2":
        return make_pipeline(StandardScaler(), Ridge(alpha=params[0]))
    if model_id == "M3":
        return make_pipeline(StandardScaler(), HuberRegressor(epsilon=params[0], alpha=params[1], max_iter=2000, tol=1e-8))
    if model_id == "M4":
        return RandomForestRegressor(n_estimators=200, max_depth=params[0], min_samples_leaf=params[1],
                                     bootstrap=True, random_state=SEED, n_jobs=1)
    if model_id == "M5":
        return HistGradientBoostingRegressor(max_iter=50, learning_rate=0.05, max_leaf_nodes=params[0],
                                             l2_regularization=params[1], min_samples_leaf=10,
                                             random_state=SEED)
    raise ValueError(f"Unknown model id: {model_id}")


def x_values(rows: list[dict]) -> np.ndarray:
    return np.asarray([[row["initial_weight_kg"]] for row in rows], dtype=float)


def y_values(rows: list[dict]) -> np.ndarray:
    return np.asarray([row["observed"] for row in rows], dtype=float)


def metric(observed, predicted) -> dict:
    observed, predicted = np.asarray(observed, dtype=float), np.asarray(predicted, dtype=float)
    if len(observed) == 0 or len(observed) != len(predicted) or not np.isfinite(predicted).all():
        raise ValueError("Metric inputs must be equal non-empty finite arrays")
    errors = predicted - observed
    return {"n": int(len(errors)), "maeKgPerHeadDay": float(np.mean(np.abs(errors))),
            "rmseKgPerHeadDay": float(np.sqrt(np.mean(errors ** 2))),
            "biasPredictedMinusObservedKgPerHeadDay": float(np.mean(errors))}


def fit_predict(model_id: str, params: tuple, train: list[dict], test: list[dict], costs: dict | None = None,
                stage: str = "outerRefit"):
    estimator = model(model_id, params)
    t0 = time.perf_counter()
    estimator.fit(x_values(train), y_values(train))
    fit_s = time.perf_counter() - t0
    t0 = time.perf_counter()
    predictions = estimator.predict(x_values(test))
    predict_s = time.perf_counter() - t0
    if costs is not None:
        costs[stage]["fitSeconds"] += fit_s
        costs[stage]["predictSeconds"] += predict_s
        costs[stage]["fitCalls"] += 1
        costs[stage]["predictRows"] += len(test)
    return predictions.tolist()


def choose_params(model_id: str, outer_train: list[dict], costs: dict) -> tuple[tuple, dict]:
    choices = GRIDS[model_id]
    inner_years = sorted({row["year"] for row in outer_train})
    scores = {}
    for params in choices:
        per_year = []
        for year in inner_years:
            train, test, _ = split_year(outer_train, year)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                pred = fit_predict(model_id, params, train, test, costs, "innerSearch")
            per_year.append({"year": year, **metric(y_values(test), pred)})
        scores[json.dumps(params)] = {"params": list(params),
                                      "yearMacroMaeKgPerHeadDay": statistics.fmean(x["maeKgPerHeadDay"] for x in per_year),
                                      "byYear": per_year}
    # Fixed tie-break order is the declared order of GRIDS.
    chosen = min(choices, key=lambda p: (scores[json.dumps(p)]["yearMacroMaeKgPerHeadDay"], choices.index(p)))
    return chosen, scores


def engine_benchmark(rows: list[dict]) -> dict:
    inputs = [{"rowId": row["row_id"], "initialWeightKg": row["initial_weight_kg"], "seasonDays": row["season_days"]} for row in rows]
    start = time.perf_counter()
    result = subprocess.run(["node", str(ROOT / "scripts/science/evaluations/predict_cper_adg_engine_v2.mjs")], input=json.dumps(inputs),
                           text=True, capture_output=True, cwd=ROOT, check=True)
    elapsed = time.perf_counter() - start
    predictions = json.loads(result.stdout)
    if len(predictions) != len(rows) or not all(math.isfinite(value) for value in predictions):
        raise ValueError("Engine row mapping did not return exactly one finite prediction per CPER row")
    row_ids = [row["row_id"] for row in rows]
    return {"predictions": predictions, "rowIdsSha256": sha256("\n".join(row_ids).encode()),
            "inputRows": len(inputs), "oneToOneRowMapping": len(row_ids) == len(set(row_ids)) == len(predictions),
            "wallSeconds": elapsed}


def summarize_oof(records: list[dict], prediction_field: str) -> dict:
    overall = metric([row["observed"] for row in records], [row[prediction_field] for row in records])
    by_year = {str(year): metric([r["observed"] for r in records if r["year"] == year],
                                [r[prediction_field] for r in records if r["year"] == year]) for year in YEARS}
    by_flag = {key: metric([r["observed"] for r in records if r["useFlag"] == key],
                           [r[prediction_field] for r in records if r["useFlag"] == key])
               for key in sorted({r["useFlag"] for r in records})}
    by_treatment = {key: metric([r["observed"] for r in records if r["treatment"] == key],
                                [r[prediction_field] for r in records if r["treatment"] == key])
                    for key in sorted({r["treatment"] for r in records})}
    metrics = ("maeKgPerHeadDay", "rmseKgPerHeadDay", "biasPredictedMinusObservedKgPerHeadDay")
    return {"pooled": overall,
            "yearMacro": {key: statistics.fmean(by_year[str(year)][key] for year in YEARS) for key in metrics},
            "byYear": by_year, "byUseFlagDescriptiveOnly": by_flag, "byTreatmentDescriptiveOnly": by_treatment}


def evaluate(rows: list[dict]) -> tuple[dict, list[dict]]:
    engine_result = engine_benchmark(rows)
    engine_raw = engine_result["predictions"]
    row_index = {row["row_id"]: i for i, row in enumerate(rows)}
    model_ids = ("M0", "M1", "M2", "M3", "M4", "M5")
    empty_cost = lambda: {"fitSeconds": 0.0, "predictSeconds": 0.0, "fitCalls": 0, "predictRows": 0}
    records, folds, costs = [], [], {key: {"innerSearch": empty_cost(), "outerRefit": empty_cost()} for key in model_ids}
    for outer_year in YEARS:
        train, test, purged = split_year(rows, outer_year)
        chosen, inner = {}, {}
        for model_id in GRIDS:
            chosen[model_id], inner[model_id] = choose_params(model_id, train, costs[model_id])
        predictions = {"M0": [statistics.fmean(r["observed"] for r in train)] * len(test)}
        for model_id in ("M1", "M2", "M3", "M4", "M5"):
            params = chosen.get(model_id, ())
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                predictions[model_id] = fit_predict(model_id, params, train, test, costs[model_id], "outerRefit")
        # Simulator rows are looked up by exact source key. Duration-conditioned outputs remain descriptive.
        engine_test = [engine_raw[row_index[r["row_id"]]] for r in test]
        denom = math.fsum(engine_raw[row_index[r["row_id"]]] ** 2 for r in train)
        scale = max(0.0, math.fsum(engine_raw[row_index[r["row_id"]]] * r["observed"] for r in train) / denom) if denom else 0.0
        predictions["engineDefaultDescriptive"] = engine_test
        predictions["engineTrainScaledDescriptive"] = [value * scale for value in engine_test]
        for i, row in enumerate(test):
            record = {"rowId": row["row_id"], "year": row["year"], "identityProxy": row["identity"],
                      "useFlag": row["use_flag"], "treatment": row["treatment"], "pasture": row["pasture"],
                      "initialWeightKg": row["initial_weight_kg"], "observed": row["observed"]}
            record.update({key: values[i] for key, values in predictions.items()})
            records.append(record)
        fold_metrics = {key: metric(y_values(test), values) for key, values in predictions.items()}
        folds.append({"outerTestYear": outer_year, "outerTrainN": len(train), "outerTestN": len(test),
                      "outerPurgedIdentityProxyCount": purged,
                      "innerTrainingYears": sorted({r["year"] for r in train}),
                      "selectedParameters": {key: list(value) for key, value in chosen.items()},
                      "innerScores": inner, "engineTrainOnlyScale": scale,
                      "testUseFlagCounts": dict(sorted(Counter(r["use_flag"] for r in test).items())),
                      "testTreatmentCounts": dict(sorted(Counter(r["treatment"] for r in test).items())),
                      "metrics": fold_metrics})
    if len(records) != 320 or len({r["rowId"] for r in records}) != 320 or any(sum(r[field] is not None for r in records) != 320 for field in model_ids):
        raise ValueError("Candidates did not produce identical complete outer OOF coverage")
    summaries = {key: summarize_oof(records, key) for key in model_ids + ("engineDefaultDescriptive", "engineTrainScaledDescriptive")}
    baseline = summaries["M0"]
    rule = {key: (summaries[key]["pooled"]["maeKgPerHeadDay"] < baseline["pooled"]["maeKgPerHeadDay"]
                  and summaries[key]["yearMacro"]["maeKgPerHeadDay"] < baseline["yearMacro"]["maeKgPerHeadDay"])
            for key in ("M1", "M2", "M3", "M4", "M5")}
    return {"models": summaries, "folds": folds, "selectionRuleImprovementOverM0": rule,
            "oofRows": 320, "allModelsSameRows": True, "engineUse": "descriptive_only_excluded_from_selection",
            "engineRowMapping": {"inputRows": engine_result["inputRows"], "predictionRows": len(engine_raw),
                                 "oneToOneRowMapping": engine_result["oneToOneRowMapping"],
                                 "orderedRowIdsSha256": engine_result["rowIdsSha256"],
                                 "inputFields": ["row_id", "initial_weight_kg", "observed season_days"],
                                 "configuration": {"seed": 20261011, "population": 1, "housing": "pasture",
                                                   "diet": "pasture", "weather": "normal", "supplementKgDMPerHeadDay": 0}},
            "cpuCosts": costs, "engineBenchmarkWallSecondsFor320Rows": engine_result["wallSeconds"]}, records


def write_outputs(report: dict, records: list[dict]) -> None:
    EXP.mkdir(parents=True, exist_ok=True)
    (EXP / "evaluation.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    fields = list(records[0])
    with (EXP / "oof-predictions.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)
    lines = ["# CPER ADG candidate comparison v2", "", "**Classification:** internal development diagnostic only; not external/prospective validation.", "",
             f"Protocol SHA-256: `{report['protocol']['sha256']}`  ", f"Source SHA-256: `{report['source']['sha256']}`  ",
             f"Outer OOF rows: {report['evaluation']['oofRows']} across five years.", "",
             "## Results", "", "| Candidate | pooled MAE | pooled RMSE | pooled bias | year-macro MAE | nested selection improved over M0? |",
             "|---|---:|---:|---:|---:|:---:|"]
    evaluation = report["evaluation"]
    for key in ("M0", "M1", "M2", "M3", "M4", "M5"):
        item = evaluation["models"][key]
        lines.append(f"| {key} — {report['candidateNames'][key]} | {item['pooled']['maeKgPerHeadDay']:.3f} | {item['pooled']['rmseKgPerHeadDay']:.3f} | {item['pooled']['biasPredictedMinusObservedKgPerHeadDay']:+.3f} | {item['yearMacro']['maeKgPerHeadDay']:.3f} | {evaluation['selectionRuleImprovementOverM0'].get(key, '—')} |")
    lines += ["", "## Mechanistic reference", "", "The default engine and train-scaled engine use each animal's realized season duration. Their scores are duration-conditioned descriptive benchmarks only; they were excluded from model tuning and selection.", "",
              "| Benchmark | pooled MAE | pooled RMSE | pooled bias |", "|---|---:|---:|---:|"]
    for key, label in (("engineDefaultDescriptive", "FarmEngine default"), ("engineTrainScaledDescriptive", "FarmEngine × outer-training scale")):
        item = evaluation["models"][key]["pooled"]
        lines.append(f"| {label} | {item['maeKgPerHeadDay']:.3f} | {item['rmseKgPerHeadDay']:.3f} | {item['biasPredictedMinusObservedKgPerHeadDay']:+.3f} |")
    lines += ["", "## Per-year metrics", "", "MAE in kg/head/day; all candidates share the exact same test rows per year.", "",
              "| Year | n | M0 | OLS | Ridge | Huber | RF | HGB |", "|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for year in YEARS:
        by_year = {key: evaluation["models"][key]["byYear"][str(year)] for key in ("M0", "M1", "M2", "M3", "M4", "M5")}
        lines.append(f"| {year} | {by_year['M0']['n']} | " + " | ".join(f"{by_year[k]['maeKgPerHeadDay']:.3f}" for k in ("M0", "M1", "M2", "M3", "M4", "M5")) + " |")
    lines += ["", "## Descriptive subgroup MAE", "", "Use.Flag and treatment are reported as subgroups only; they were not used as predictors or selection variables.", "",
              "| Candidate | Use.Flag 0 | Use.Flag outlier | Treatment heavy | moderate | light |", "|---|---:|---:|---:|---:|---:|"]
    for key in ("M0", "M1", "M2", "M3", "M4", "M5"):
        item = evaluation["models"][key]
        flags = item["byUseFlagDescriptiveOnly"]
        treatments = item["byTreatmentDescriptiveOnly"]
        values = [flags.get("0", {}).get("maeKgPerHeadDay"), flags.get("outlier", {}).get("maeKgPerHeadDay"),
                  treatments.get("heavy", {}).get("maeKgPerHeadDay"), treatments.get("moderate", {}).get("maeKgPerHeadDay"),
                  treatments.get("light", {}).get("maeKgPerHeadDay")]
        lines.append(f"| {key} | " + " | ".join("n/a" if value is None else f"{value:.3f}" for value in values) + " |")
    lines += ["", "## Interpretation and limits", "", "- Hyperparameters are selected only within the four available inner years of each outer fold. The same five outer years were examined in earlier CPER work, so these nested OOF results are development diagnostics, not an untouched validation set.",
              "- Identity purging uses Owner|Tag.Color|Tag as a proxy; a permanent ID was not verified. Treatment and pasture are aliased and excluded.",
              "- Realized season duration is excluded from all learned models. Engine results condition on that observed duration, so cannot be compared as pre-season predictions or selected for advancement.",
              "- One site and five years do not support transport claims. These results do not validate mature cows, DMI, causal treatment effects, or the full simulator.",
              "- No CGREC outcomes were read or used.", "",
              "## Runtime", "", "Cumulative nested-search and outer-refit costs (CPU seconds; environment-dependent):", "",
              "| Candidate | Fit calls | Fit seconds | Predict rows | Predict seconds | Predict µs/row |", "|---|---:|---:|---:|---:|---:|"]
    for key in ("M1", "M2", "M3", "M4", "M5"):
        item = evaluation["cpuCosts"][key]
        stages = (item["innerSearch"], item["outerRefit"])
        fit_calls = sum(stage["fitCalls"] for stage in stages)
        fit_seconds = sum(stage["fitSeconds"] for stage in stages)
        predict_rows = sum(stage["predictRows"] for stage in stages)
        predict_seconds = sum(stage["predictSeconds"] for stage in stages)
        per_row_us = predict_seconds * 1_000_000 / predict_rows if predict_rows else 0
        lines.append(f"| {key} | {fit_calls} | {fit_seconds:.6f} | {predict_rows} | {predict_seconds:.6f} | {per_row_us:.2f} |")
    engine_seconds = evaluation["engineBenchmarkWallSecondsFor320Rows"]
    lines += [f"| Engine reference (320 rows) | — | — | 320 | {engine_seconds:.6f} | {engine_seconds * 1_000_000 / 320:.2f} |",
              "", "Timings are environment-dependent and intended only as inference-cost diagnostics. Fit seconds include nested candidate search and outer refits; engine row time includes helper-process startup.", "",
              "Reproduce with `python3 scripts/science/evaluations/evaluate_cper_adg_candidate_v2.py` under `requirements-data-processing.txt`."]
    (EXP / "evaluation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    start = time.perf_counter()
    protocol_bytes = PROTOCOL.read_bytes()
    protocol = json.loads(protocol_bytes)
    if protocol.get("status") != "preregistered_before_execution":
        raise ValueError("Experiment protocol is not preregistered")
    rows, source = read_cohort()
    evaluation, records = evaluate(rows)
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None
    script_bytes = Path(__file__).read_bytes()
    engine_helper = ROOT / "scripts/science/evaluations/predict_cper_adg_engine_v2.mjs"
    engine_helper_bytes = engine_helper.read_bytes()
    report = {
        "schemaVersion": "1.0.0", "experimentId": protocol["experimentId"], "classification": protocol["classification"],
        "status": "completed_internal_development_diagnostic",
        "protocol": {"path": str(PROTOCOL.relative_to(ROOT)), "sha256": sha256(protocol_bytes)},
        "source": {**source, "path": str(SOURCE.relative_to(ROOT))},
        "code": {"commitAtExecution": commit, "script": str(Path(__file__).resolve().relative_to(ROOT)),
                 "scriptSha256": sha256(script_bytes), "engineHelper": "scripts/science/evaluations/predict_cper_adg_engine_v2.mjs",
                 "engineHelperSha256": sha256(engine_helper_bytes)},
        "execution": {"completedAtUtc": datetime.now(timezone.utc).isoformat(),
                      "wallSeconds": time.perf_counter() - start, "python": sys.version.split()[0],
                      "numpy": np.__version__, "scikitLearn": __import__("sklearn").__version__,
                      "deterministicSeeds": {"randomForest": SEED, "histGradientBoosting": SEED}},
        "cohort": {"n": len(rows), "years": {str(y): sum(r["year"] == y for r in rows) for y in YEARS},
                   "identityProxyCount": len({r["identity"] for r in rows}),
                   "useFlagCounts": dict(sorted(Counter(r["use_flag"] for r in rows).items())),
                   "treatmentPasturePairs": dict(sorted(Counter(f"{r['treatment']}|{r['pasture']}" for r in rows).items()))},
        "candidateNames": {"M0": "training mean", "M1": "OLS", "M2": "Ridge", "M3": "Huber", "M4": "shallow random forest", "M5": "shallow histogram gradient boosting"},
        "evaluation": evaluation,
        "interpretation": ["All fitted predictors use initial body weight only; preprocessing is fitted on the corresponding training rows.",
                           "The default engine and its fold-local scaled form condition on observed realized duration and are descriptive only; they are excluded from selection.",
                           "No CGREC outcomes were read or used.",
                           "This experiment is internal development on one site and five year blocks, not validation or transport evidence."],
        "validated": False, "externallyValidated": False, "cgrecOutcomesUsed": False, "promoted": False,
    }
    write_outputs(report, records)
    print(json.dumps({"experimentId": report["experimentId"], "protocolSha256": report["protocol"]["sha256"],
                      "models": {k: round(v["pooled"]["maeKgPerHeadDay"], 6) for k, v in evaluation["models"].items()},
                      "selectionRuleImprovementOverM0": evaluation["selectionRuleImprovementOverM0"],
                      "wallSeconds": report["execution"]["wallSeconds"]}, indent=2))


if __name__ == "__main__":
    main()
