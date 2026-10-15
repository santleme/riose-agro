#!/usr/bin/env python3
"""Nested year-blocked development experiment for CPER steer ADG.

Writes only to experiments/diagnostics/adg/cper-preoutcome-candidate-v1/.
No CGREC data or prior external-evaluation outputs are read.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
import subprocess
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXPERIMENT = ROOT / "experiments/diagnostics/adg/cper-preoutcome-candidate-v1"
PROTOCOL_PATH = EXPERIMENT / "preregister.json"
SOURCE = ROOT / "data/usda-cper-ltgi-2000-2019/LTGI_2000-2019_all_weights_published.csv"
MANIFEST = ROOT / "data/usda-cper-ltgi-2000-2019/manifest.json"
LB_TO_KG = 0.45359237
YEARS = (2009, 2010, 2011, 2012, 2013)
ALPHAS = (0.01, 0.1, 1.0, 10.0)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_cohort(source_path: Path = SOURCE, manifest_path: Path = MANIFEST) -> tuple[list[dict], dict]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entry = next(item for item in manifest["files"] if item["name"] == source_path.name)
    raw = source_path.read_bytes()
    digest = sha256_bytes(raw)
    if digest != entry["sha256"]:
        raise ValueError("CPER source checksum differs from the checked-in manifest")
    with source_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        required = {
            "Year", "Type", "Pasture", "Treatment", "Owner", "Tag.Color", "Tag",
            "Season.Days", "on_Weight", "off_Weight", "Use.Flag",
        }
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Missing required columns: {sorted(required - set(reader.fieldnames or []))}")
        rows = []
        for raw_row in reader:
            try:
                year = int(raw_row["Year"])
            except (TypeError, ValueError):
                continue
            if year not in YEARS or raw_row["Type"].strip().lower() != "steer":
                continue
            days = float(raw_row["Season.Days"])
            initial_lb = float(raw_row["on_Weight"])
            final_lb = float(raw_row["off_Weight"])
            if not all(math.isfinite(x) for x in (days, initial_lb, final_lb)) or days <= 0 or initial_lb <= 0 or final_lb <= 0:
                raise ValueError(f"Invalid weight or interval in CPER year {year}")
            owner = raw_row["Owner"].strip()
            tag_color = raw_row["Tag.Color"].strip()
            tag = raw_row["Tag"].strip()
            if not all((owner, tag_color, tag)):
                raise ValueError(f"Missing identity proxy in CPER year {year}")
            pasture = raw_row["Pasture"].strip()
            treatment = raw_row["Treatment"].strip().lower()
            rows.append({
                "row_id": f"{year}|{pasture}|{owner}|{tag_color}|{tag}",
                "year": year,
                "pasture": pasture,
                "treatment": treatment,
                "identity": f"{owner}|{tag_color}|{tag}",
                "use_flag": raw_row["Use.Flag"].strip() or "(missing)",
                "initial_weight_kg": initial_lb * LB_TO_KG,
                # Deliberately retained only for outcome reconstruction, never as a feature.
                "season_days": days,
                "observed_adg_kg_day": (final_lb - initial_lb) * LB_TO_KG / days,
            })
    if len(rows) != 320:
        raise ValueError(f"Expected the preregistered 320 CPER yearling-steer rows, found {len(rows)}")
    return rows, {"sha256": digest, "bytes": len(raw), "doi": manifest["doi"], "license": manifest["license"]}


def treatment_alias_audit(rows: list[dict]) -> dict:
    treatment_to_pastures: dict[str, set[str]] = defaultdict(set)
    pasture_to_treatments: dict[str, set[str]] = defaultdict(set)
    counts = Counter()
    for row in rows:
        treatment_to_pastures[row["treatment"]].add(row["pasture"])
        pasture_to_treatments[row["pasture"]].add(row["treatment"])
        counts[f"{row['treatment']}|{row['pasture']}"] += 1
    return {
        "treatmentToPastures": {key: sorted(value) for key, value in sorted(treatment_to_pastures.items())},
        "pastureToTreatments": {key: sorted(value) for key, value in sorted(pasture_to_treatments.items())},
        "rowCountsByPair": dict(sorted(counts.items())),
        "perfectOneToOneAlias": all(len(x) == 1 for x in treatment_to_pastures.values())
        and all(len(x) == 1 for x in pasture_to_treatments.values()),
        "decision": "Treatment and pasture are excluded as predictors: each treatment is represented by exactly one remaining pasture, so the data cannot distinguish treatment from pasture or support extrapolation to a new pasture.",
    }


def split_year(rows: list[dict], year: int) -> tuple[list[dict], list[dict], int]:
    test = [row for row in rows if row["year"] == year]
    if not test:
        raise ValueError(f"No test observations for year {year}")
    test_identities = {row["identity"] for row in test}
    before = [row for row in rows if row["year"] != year]
    train = [row for row in before if row["identity"] not in test_identities]
    purged_ids = {row["identity"] for row in before if row["identity"] in test_identities}
    if not train or any(row["identity"] in test_identities for row in train):
        raise ValueError(f"Identity-proxy leakage in held-out year {year}")
    return train, test, len(purged_ids)


def fit_predict_linear(train: list[dict], test: list[dict], alpha: float) -> list[float]:
    """Fit a 1D standardized ridge with unpenalized intercept using stdlib math."""
    x = [row["initial_weight_kg"] for row in train]
    y = [row["observed_adg_kg_day"] for row in train]
    x_mean = statistics.fmean(x)
    y_mean = statistics.fmean(y)
    x_scale = math.sqrt(statistics.fmean((value - x_mean) ** 2 for value in x)) or 1.0
    z = [(value - x_mean) / x_scale for value in x]
    numerator = math.fsum(zi * (yi - y_mean) for zi, yi in zip(z, y))
    denominator = math.fsum(zi * zi for zi in z) + alpha
    slope = numerator / denominator if denominator else 0.0
    return [y_mean + slope * ((row["initial_weight_kg"] - x_mean) / x_scale) for row in test]


def summarize(observed: list[float], predicted: list[float]) -> dict:
    if not observed or len(observed) != len(predicted):
        raise ValueError("Metric inputs must have equal, non-zero lengths")
    errors = [p - y for y, p in zip(observed, predicted)]
    return {
        "n": len(errors),
        "maeKgPerHeadDay": statistics.fmean(abs(x) for x in errors),
        "rmseKgPerHeadDay": math.sqrt(statistics.fmean(x * x for x in errors)),
        "biasPredictedMinusObservedKgPerHeadDay": statistics.fmean(errors),
    }


def nested_evaluate(rows: list[dict]) -> tuple[dict, list[dict]]:
    outer_records: list[dict] = []
    folds: list[dict] = []
    for outer_year in YEARS:
        outer_train, outer_test, outer_purged = split_year(rows, outer_year)
        train_years = sorted({row["year"] for row in outer_train})
        inner_scores = {}
        for alpha in ALPHAS:
            fold_scores = []
            for inner_year in train_years:
                inner_train, inner_test, _ = split_year(outer_train, inner_year)
                preds = fit_predict_linear(inner_train, inner_test, alpha)
                metric = summarize([r["observed_adg_kg_day"] for r in inner_test], preds)
                fold_scores.append({"year": inner_year, **metric})
            inner_scores[str(alpha)] = {
                "yearMacroMaeKgPerHeadDay": statistics.fmean(item["maeKgPerHeadDay"] for item in fold_scores),
                "byYear": fold_scores,
            }
        chosen_alpha = min(ALPHAS, key=lambda a: (inner_scores[str(a)]["yearMacroMaeKgPerHeadDay"], a))
        preds = {
            "M0": [statistics.fmean(row["observed_adg_kg_day"] for row in outer_train)] * len(outer_test),
            "M1": fit_predict_linear(outer_train, outer_test, 0.0),
            "M2": fit_predict_linear(outer_train, outer_test, chosen_alpha),
        }
        fold_metrics = {
            candidate: summarize([row["observed_adg_kg_day"] for row in outer_test], prediction)
            for candidate, prediction in preds.items()
        }
        for row, prediction in zip(outer_test, zip(preds["M0"], preds["M1"], preds["M2"])):
            outer_records.append({
                "rowId": row["row_id"], "year": row["year"], "useFlag": row["use_flag"],
                "treatment": row["treatment"], "pasture": row["pasture"],
                "initialWeightKg": row["initial_weight_kg"], "observedAdgKgPerHeadDay": row["observed_adg_kg_day"],
                "M0TrainingMean": prediction[0], "M1OlsInitialWeight": prediction[1],
                "M2RidgeInitialWeight": prediction[2], "M2SelectedAlpha": chosen_alpha,
            })
        folds.append({
            "outerTestYear": outer_year,
            "outerTrainN": len(outer_train),
            "outerTestN": len(outer_test),
            "outerPurgedIdentityProxyCount": outer_purged,
            "innerTrainingYears": train_years,
            "m2SelectedAlpha": chosen_alpha,
            "m2InnerScores": inner_scores,
            "testUseFlagCounts": dict(sorted(Counter(row["use_flag"] for row in outer_test).items())),
            "testTreatmentCounts": dict(sorted(Counter(row["treatment"] for row in outer_test).items())),
            "metrics": fold_metrics,
        })
    if len(outer_records) != len(rows):
        raise ValueError("Outer OOF predictions do not cover each source row exactly once")
    metrics_by_model = {}
    field_by_model = {"M0": "M0TrainingMean", "M1": "M1OlsInitialWeight", "M2": "M2RidgeInitialWeight"}
    for model, prediction_field in field_by_model.items():
        obs = [row["observedAdgKgPerHeadDay"] for row in outer_records]
        pred = [row[prediction_field] for row in outer_records]
        year_summaries = [summarize(
            [row["observedAdgKgPerHeadDay"] for row in outer_records if row["year"] == year],
            [row[prediction_field] for row in outer_records if row["year"] == year],
        ) for year in YEARS]
        flag_summaries = {}
        for flag in sorted({row["useFlag"] for row in outer_records}):
            subset = [row for row in outer_records if row["useFlag"] == flag]
            flag_summaries[flag] = summarize(
                [row["observedAdgKgPerHeadDay"] for row in subset],
                [row[prediction_field] for row in subset],
            )
        metrics_by_model[model] = {
            "pooled": summarize(obs, pred),
            "yearMacro": {key: statistics.fmean(item[key] for item in year_summaries)
                          for key in ("maeKgPerHeadDay", "rmseKgPerHeadDay", "biasPredictedMinusObservedKgPerHeadDay")},
            "byYear": {str(year): metric for year, metric in zip(YEARS, year_summaries)},
            "byUseFlagDescriptiveOnly": flag_summaries,
        }
    return {"models": metrics_by_model, "folds": folds, "oofRowCount": len(outer_records)}, outer_records


def main() -> None:
    started = time.perf_counter()
    protocol = json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))
    protocol_bytes = PROTOCOL_PATH.read_bytes()
    rows, source = read_cohort()
    alias = treatment_alias_audit(rows)
    if not alias["perfectOneToOneAlias"]:
        raise ValueError("Treatment/pasture alias audit no longer matches the preregistration; stop and review features")
    evaluation, oof_rows = nested_evaluate(rows)
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = None
    report = {
        "schemaVersion": "1.0.0",
        "experimentId": protocol["experimentId"],
        "classification": protocol["classification"],
        "status": "completed_internal_development_only",
        "protocol": {"path": str(PROTOCOL_PATH.relative_to(ROOT)), "sha256": sha256_bytes(protocol_bytes)},
        "source": {**source, "path": str(SOURCE.relative_to(ROOT))},
        "code": {"commit": commit, "script": str(Path(__file__).resolve().relative_to(ROOT))},
        "execution": {"completedAtUtc": datetime.now(timezone.utc).isoformat(), "wallSeconds": time.perf_counter() - started,
                      "runtime": "Python standard library only; deterministic closed-form one-feature OLS/Ridge; no random seed used"},
        "cohort": {
            "rowCount": len(rows), "population": protocol["population"],
            "byYear": dict(sorted(Counter(str(row["year"]) for row in rows).items())),
            "useFlagCounts": dict(sorted(Counter(row["use_flag"] for row in rows).items())),
            "initialWeightKgRange": [min(row["initial_weight_kg"] for row in rows), max(row["initial_weight_kg"] for row in rows)],
            "seasonDaysRangeDescriptiveOnly": [min(row["season_days"] for row in rows), max(row["season_days"] for row in rows)],
            "identitiesBeforePurge": len({row["identity"] for row in rows}),
        },
        "featureAudit": {
            "included": protocol["features"]["included"],
            "excluded": protocol["features"]["excluded"],
            "treatmentPastureAlias": alias,
        },
        "evaluation": evaluation,
        "interpretation": [
            "This is internal model development within one CPER site and five annual blocks, not external or prospective validation.",
            "The model feature set contains initial weight only; realized season duration, treatment and pasture are excluded.",
            "Treatment and pasture are perfectly aliased in this cohort; a treatment coefficient cannot be separated from a pasture effect, and transport to unseen pastures is unsupported.",
            "Only five outer year blocks are available, so no inferential confidence interval or robust stability claim is made.",
            "The small univariate candidate set did not use CGREC or any previously reported external metrics for fitting, tuning or selection.",
            "Results do not validate mature cows, DMI, causal treatment effects, new sites, or the complete simulator.",
        ],
        "validated": False,
        "externallyValidated": False,
        "cgrecOutcomesUsed": False,
        "promoted": False,
    }
    EXPERIMENT.mkdir(parents=True, exist_ok=True)
    (EXPERIMENT / "evaluation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with (EXPERIMENT / "oof-predictions.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(oof_rows[0].keys()))
        writer.writeheader()
        writer.writerows(oof_rows)
    lines = [
        "# CPER pre-outcome ADG candidate development v1", "",
        "**Status:** internal development only; not external or prospective validation.", "",
        f"Protocol SHA-256: `{report['protocol']['sha256']}`  ",
        f"Source SHA-256: `{source['sha256']}`  ",
        f"Outer OOF predictions: {evaluation['oofRowCount']} across {len(YEARS)} held-out years.", "",
        "## Feature and alias audit", "",
        "Initial weight is the only model feature. Realized season duration is excluded because it may not be known before prediction. Treatment and pasture are excluded because each treatment maps to exactly one pasture in this dataset.", "",
        "## Nested year-held-out results", "",
        "All tuning of the Ridge alpha occurs in inner leave-one-year-out folds inside the outer training years. These OOF scores are descriptive internal development results.", "",
        "| Model | Pooled MAE | Pooled RMSE | Pooled bias | Year-macro MAE |",
        "|---|---:|---:|---:|---:|",
    ]
    labels = {"M0": "Training mean", "M1": "OLS: initial weight", "M2": "Ridge: initial weight (inner-year alpha)"}
    for model, metrics in evaluation["models"].items():
        p = metrics["pooled"]
        lines.append(f"| {labels[model]} | {p['maeKgPerHeadDay']:.3f} | {p['rmseKgPerHeadDay']:.3f} | {p['biasPredictedMinusObservedKgPerHeadDay']:+.3f} | {metrics['yearMacro']['maeKgPerHeadDay']:.3f} |")
    lines.extend(["", "## Fold details", "", "| Held-out year | Train n | Test n | Purged ID proxies | Ridge alpha | M0 MAE | OLS MAE | Ridge MAE |", "|---:|---:|---:|---:|---:|---:|---:|---:|"])
    for fold in evaluation["folds"]:
        m = fold["metrics"]
        lines.append(f"| {fold['outerTestYear']} | {fold['outerTrainN']} | {fold['outerTestN']} | {fold['outerPurgedIdentityProxyCount']} | {fold['m2SelectedAlpha']:g} | {m['M0']['maeKgPerHeadDay']:.3f} | {m['M1']['maeKgPerHeadDay']:.3f} | {m['M2']['maeKgPerHeadDay']:.3f} |")
    lines.extend(["", "## Limits", "", *[f"- {item}" for item in report["interpretation"]], "",
                  "Reproduce with `python3 scripts/science/evaluations/evaluate_cper_preoutcome_adg_candidates.py`. The JSON report and OOF predictions are stored beside this report."])
    (EXPERIMENT / "evaluation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"classification": report["classification"], "sourceSha256": source["sha256"],
                      "oofRowCount": evaluation["oofRowCount"], "models": {k: v["pooled"] for k, v in evaluation["models"].items()},
                      "ridgeAlphaByHeldYear": {str(f["outerTestYear"]): f["m2SelectedAlpha"] for f in evaluation["folds"]},
                      "treatmentPastureAlias": alias["perfectOneToOneAlias"], "cgrecOutcomesUsed": False}, indent=2))


if __name__ == "__main__":
    main()
