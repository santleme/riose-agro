#!/usr/bin/env python3
"""Describe the frozen Perea grouped-OOF predictions; never fits a model."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
OOF = ROOT / "docs/evidence/perea-behavior-grouped-oof-predictions.csv"
OUT_JSON = ROOT / "docs/evidence/perea-behavior-oof-diagnostic.json"
OUT_MD = ROOT / "docs/evidence/perea-behavior-oof-diagnostic.md"
CLASSES = ("GR", "RE", "RU", "WA")
RANCH_BY_BREED = {
    "AH": "Jornada Experimental Range (USDA)",
    "RC": "Jornada Experimental Range (USDA)",
    "BR": "Chihuahuan Desert Rangeland Research Center (NMSU)",
    "BH": "Chihuahuan Desert Rangeland Research Center (NMSU)",
}


def read_raw_duplicates() -> dict:
    grouped = defaultdict(list)
    all_rows = []
    with SOURCE.open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            timestamp = datetime.strptime(row["Time.MTD"], "%m/%d/%Y %H:%M")
            row = {
                "breed": row["Breed"].strip(),
                "animal": row["ID"].strip(),
                "timestamp": timestamp,
                "mi": float(row["MI"]),
                "state": row["State"].strip(),
                "behavior": row["Behavior"].strip(),
            }
            all_rows.append(row)
            grouped[(row["breed"], row["animal"], timestamp)].append(row)
    repeated = {key: values for key, values in grouped.items() if len(values) > 1}
    conflicting = {
        key: values for key, values in repeated.items()
        if len({row["behavior"] for row in values}) > 1
    }
    exact_extra = sum(
        len(values) - len({(row["mi"], row["state"], row["behavior"]) for row in values})
        for values in repeated.values()
    )
    return {
        "publishedRows": len(all_rows),
        "uniqueAnimalMinuteKeys": len(grouped),
        "repeatedAnimalMinuteKeys": len(repeated),
        "extraRowsAtRepeatedKeys": sum(len(values) - 1 for values in repeated.values()),
        "exactDuplicateExtraRows": exact_extra,
        "sameLabelRepeatedKeys": sum(key not in conflicting for key in repeated),
        "conflictingLabelKeys": len(conflicting),
        "rowsInConflictingLabelKeys": sum(len(values) for values in conflicting.values()),
        "conflictLabelPairs": dict(sorted(Counter(
            "/".join(sorted({row["behavior"] for row in values})) for values in conflicting.values()
        ).items())),
        "handlingInFrozenOof": "Same-label repeats collapsed to one animal-minute by mean MI; all rows at conflicting-label keys excluded.",
    }


def confusion(rows: list[dict]) -> dict:
    matrix = {actual: Counter() for actual in CLASSES}
    for row in rows:
        matrix[row["actual"]][row["predicted"]] += 1
    per_class = {}
    for label in CLASSES:
        tp = matrix[label][label]
        support = sum(matrix[label].values())
        predicted_n = sum(matrix[actual][label] for actual in CLASSES)
        precision = tp / predicted_n if predicted_n else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[label] = {
            "support": support,
            "correct": tp,
            "errors": support - tp,
            "errorRate": (support - tp) / support if support else None,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "predictedAs": {target: matrix[label][target] for target in CLASSES},
        }
    return {"perClass": per_class, "matrixActualRowsPredictedColumns": {k: dict(v) for k, v in matrix.items()}}


def per_group(rows: list[dict], field: str) -> dict:
    groups = defaultdict(list)
    for row in rows:
        groups[row[field]].append(row)
    out = {}
    for group, group_rows in sorted(groups.items()):
        out[group] = {
            "records": len(group_rows),
            "recordAccuracy": sum(r["actual"] == r["predicted"] for r in group_rows) / len(group_rows),
            "classMetrics": confusion(group_rows)["perClass"],
        }
    return out


def temporal_diagnostics(rows: list[dict]) -> dict:
    animals = defaultdict(list)
    for row in rows:
        animals[row["group"]].append(row)
    adjacent = []
    longest_error_runs = {}
    exact_one_minute_segments = 0
    for group, observations in animals.items():
        observations.sort(key=lambda row: row["timestamp"])
        longest = 0
        run = 0
        segment_length = 0
        previous = None
        for row in observations:
            correct = row["actual"] == row["predicted"]
            if previous is None or row["timestamp"] - previous["timestamp"] != timedelta(minutes=1):
                if segment_length:
                    exact_one_minute_segments += 1
                segment_length = 1
                run = 0
            else:
                segment_length += 1
                adjacent.append((previous, row))
            if correct:
                run = 0
            else:
                run += 1
                longest = max(longest, run)
            previous = row
        if segment_length:
            exact_one_minute_segments += 1
        longest_error_runs[group] = longest
    n = len(adjacent)
    if not n:
        raise ValueError("No exactly adjacent animal-minute pairs in OOF records")
    prev_correct = [a["actual"] == a["predicted"] for a, _ in adjacent]
    current_correct = [b["actual"] == b["predicted"] for _, b in adjacent]
    n_prev_correct = sum(prev_correct)
    n_prev_error = n - n_prev_correct
    return {
        "exactlyAdjacentAnimalMinutePairs": n,
        "contiguousOneMinuteSegments": exact_one_minute_segments,
        "observedLabelPersistence": sum(a["actual"] == b["actual"] for a, b in adjacent) / n,
        "predictionPersistence": sum(a["predicted"] == b["predicted"] for a, b in adjacent) / n,
        "correctnessStatusPersistence": sum(x == y for x, y in zip(prev_correct, current_correct)) / n,
        "currentAccuracyGivenPreviousCorrect": (
            sum(y for x, y in zip(prev_correct, current_correct) if x) / n_prev_correct
            if n_prev_correct else None
        ),
        "currentAccuracyGivenPreviousError": (
            sum(y for x, y in zip(prev_correct, current_correct) if not x) / n_prev_error
            if n_prev_error else None
        ),
        "adjacentPairsBothWrong": sum(not x and not y for x, y in zip(prev_correct, current_correct)),
        "longestConsecutiveErrorRunByAnimal": longest_error_runs,
        "longestConsecutiveErrorRunSummary": {
            "min": min(longest_error_runs.values()),
            "median": sorted(longest_error_runs.values())[len(longest_error_runs) // 2],
            "max": max(longest_error_runs.values()),
            "animalsWithAnyErrorRunAtLeast5": sum(v >= 5 for v in longest_error_runs.values()),
        },
        "interpretation": "Pairs are only exact one-minute timestamp neighbors; gaps break temporal continuity. The source label protocol carries the prior label forward when a behavior lasts under 30 seconds, so label persistence is partly protocol-induced.",
    }


def build_report() -> dict:
    raw_audit = read_raw_duplicates()
    with OOF.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row["group"] = f"{row['breed']}:{row['animal_id']}"
        row["ranch"] = RANCH_BY_BREED[row["breed"]]
        row["timestamp"] = datetime.fromisoformat(row["timestamp_mountain_time"])
        row["actual"] = row["behavior_observed"]
        row["predicted"] = row["behavior_oof_logistic"]
    by_breed = defaultdict(list)
    for row in rows:
        by_breed[row["breed"]].append(row)
    by_ranch = defaultdict(list)
    for row in rows:
        by_ranch[row["ranch"]].append(row)
    provenance = {
        "ranchColumnInCsv": False,
        "ranchMappingAvailable": True,
        "mappingBasis": "Primary Figshare record's dataset description maps AH and RC herds to Jornada Experimental Range (USDA), and BR and BH herds to Chihuahuan Desert Rangeland Research Center (NMSU). The CSV contains Breed, ID, timestamp, MI, State, Behavior, but no ranch field.",
        "ranchByBreed": RANCH_BY_BREED,
        "animalsByRanch": {
            ranch: sorted({row["group"] for row in ranch_rows})
            for ranch, ranch_rows in by_ranch.items()
        },
        "leaveOneRanchOutPossible": True,
        "leaveOneRanchOutLimitation": "Only two sites; breed is fully nested within site (AH/RC only at Jornada, BR/BH only at CDRRC), so site shift is confounded with breed and two outer folds cannot establish general cross-ranch transportability.",
    }
    return {
        "kind": "diagnostic_only_existing_oof_no_model_fit",
        "source": {
            "datasetDoi": "10.6084/m9.figshare.28801181.v2",
            "datasetUrl": "https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181",
            "articleDoi": "10.1016/j.atech.2025.101002",
            "feature": "single 1-minute scalar motion index MI; raw X/Y/Z accelerometer axes are not in this source table",
            "target": "human-reviewed GR, RE, RU, WA behavior labels",
            "classLabelProtocol": "One-minute labels; class assigned at >=30 seconds, otherwise previous label carried forward.",
            "citations": [
                "https://doi.org/10.6084/m9.figshare.28801181.v2",
                "https://doi.org/10.1016/j.atech.2025.101002",
            ],
        },
        "oofCoverage": {
            "rows": len(rows),
            "animals": len({row["group"] for row in rows}),
            "folds": sorted({row["fold"] for row in rows}),
            "modelColumn": "behavior_oof_logistic",
            "labelColumn": "behavior_observed",
            "note": "This file is the frozen grouped-by-animal OOF output; this diagnostic does not retrain, tune, or change its predictions.",
        },
        "classFailureRates": confusion(rows),
        "byBreed": {breed: {"records": len(items), **confusion(items)} for breed, items in sorted(by_breed.items())},
        "byAnimal": per_group(rows, "group"),
        "animalErrorSummary": {
            "accuracyMin": min(value["recordAccuracy"] for value in per_group(rows, "group").values()),
            "accuracyMedian": sorted(value["recordAccuracy"] for value in per_group(rows, "group").values())[12],
            "accuracyMax": max(value["recordAccuracy"] for value in per_group(rows, "group").values()),
            "worstFiveAnimalsByAccuracy": sorted(
                [{"animal": key, "accuracy": value["recordAccuracy"], "records": value["records"]}
                 for key, value in per_group(rows, "group").items()],
                key=lambda row: (row["accuracy"], row["animal"]),
            )[:5],
        },
        "duplicateTimestampAudit": raw_audit,
        "temporalDependence": temporal_diagnostics(rows),
        "ranchProvenance": provenance,
        "failureDiagnosis": [
            "Resting (RE) is the main weak class: it is most often predicted as rumination (RU), a biologically plausible but task-relevant error because the target labels distinguish those behaviors.",
            "A single scalar MI discards direction/axis and fine-grained head/jaw motion; source documentation describes RU and RE as both static and the article summary reports no detected MI difference between them.",
            "Temporal records are not independent: labels and errors persist across adjacent minutes, while the source annotation protocol explicitly carries previous labels forward for sub-30-second behaviors.",
            "The current grouped split prevents animal-ID leakage, but has the same ranch/date/sensor context in train and test; it cannot demonstrate new-ranch transfer.",
        ],
        "preregisteredNextEvaluation": {
            "status": "proposal_only_not_run",
            "freezeBeforeRun": [
                "Freeze the source file checksum, class definitions, the already used duplicate policy, class order, two site assignments from primary source provenance, and the exact outer/inner fold memberships before any new fit.",
                "Keep the four original labels as the primary endpoint. Do not merge RE/RU after inspecting outer results; a 3-class or 2-state endpoint must be predeclared as a separate analysis.",
                "Use only causal sensor features. No future MI and no ground-truth behavior lags are allowed; reset temporal windows at time gaps.",
            ],
            "outerCV": "Six fixed grouped folds over 24 animals, one animal per breed per fold (the current balanced animal split), with all observations from each animal held together.",
            "innerCV": "Within each 20-animal outer-training partition, five grouped folds, each holding one animal per breed. Fit scaling, thresholds, class weights, and all hyperparameters using inner-training animals only.",
            "candidateFamilies": [
                {
                    "family": "univariate threshold/rule",
                    "limit": "One pre-specified hierarchical set of MI cutpoints for the four classes; all cutpoints selected only in inner folds.",
                },
                {
                    "family": "multinomial logistic",
                    "limit": "MI only; fixed small L2 grid [0.1, 1, 10] expressed as inverse regularization C; preprocessing and equal-animal/class weights fitted on inner training only.",
                },
                {
                    "family": "shallow CART",
                    "limit": "MI only; depth [2, 3, 4] and minimum leaf [30, 60] candidate grid; no post-hoc pruning based on outer metrics.",
                },
                {
                    "family": "causal temporal logistic",
                    "limit": "Current MI, prior 1/2/4-minute MI lags and causal 3/5-minute trailing mean; no future values or label-history features; evaluate all candidate families on identical rows with complete causal history.",
                },
            ],
            "selectionCriterion": {
                "primary": "Maximize equal-animal-weighted mean of per-class F1 for RE and RU on inner grouped OOF predictions.",
                "tieBreakers": [
                    "Higher minimum of RE and RU recall.",
                    "Higher equal-animal-weighted four-class macro-F1.",
                    "Lower model complexity (threshold/rule, then logistic, then shallower tree, then temporal model).",
                ],
                "outerReporting": "After one model family/hyperparameter setting is selected inside each outer training partition, report outer OOF confusion, per-class precision/recall/F1, equal-animal-weighted metrics, per-animal metrics, and fold-specific results. No candidate is selected using outer outcomes.",
                "sameCases": "For temporal comparisons, compare every candidate on the same rows with complete prior-window history; separately state the omitted startup/gap rows.",
            },
            "crossRanchStressTest": "Because primary Figshare provenance maps AH/RC to Jornada and BR/BH to CDRRC, a supplementary two-fold leave-one-ranch-out evaluation is possible by grouping the 12 cows at each site. Keep this separate from the 6-fold nested animal CV; breed and site are perfectly confounded, only two sites exist, and the result cannot estimate broad ranch-to-ranch transportability.",
            "reportingGuardrail": "If RE/RU weak-class F1 remains low, report four-class behavior classification as not ready; do not use overall accuracy or merge labels post hoc to claim success.",
        },
        "scopeGuardrails": [
            "No candidates were fitted or tuned in this diagnostic step.",
            "The existing Perea OOF behavior scores are not evidence for DMI, ADG, forage intake, BR-CORTE, or the Riose engine.",
            "CPER and Grazing Ingestive Behavior remain separate cohorts with different grains and targets.",
        ],
    }


def main() -> None:
    report = build_report()
    OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    classes = report["classFailureRates"]["perClass"]
    lines = [
        "# Diagnostic of the frozen Perea grouped OOF behavior predictions",
        "",
        "**Diagnosis only:** this report summarizes existing out-of-fold rows. It does not fit or tune any model and does not change the historical baseline report or evaluation script.",
        "",
        "## Class failure rates",
        "",
        "| Class | Support | Errors | Error rate | Precision | Recall | F1 | Most common confusion |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for label in CLASSES:
        item = classes[label]
        confusions = sorted(
            ((count, target) for target, count in item["predictedAs"].items() if target != label),
            reverse=True,
        )
        common = f"{confusions[0][1]} ({confusions[0][0]})" if confusions else "—"
        lines.append(
            f"| {label} | {item['support']} | {item['errors']} | {item['errorRate']:.3f} | {item['precision']:.3f} | {item['recall']:.3f} | {item['f1']:.3f} | {common} |"
        )
    lines.extend(["", "## Breed and animal variation", "", "| Breed | Records | GR recall | RE recall | RU recall | WA recall |", "|---|---:|---:|---:|---:|---:|"])
    for breed, item in report["byBreed"].items():
        m = item["perClass"]
        lines.append(f"| {breed} | {item['records']} | {m['GR']['recall']:.3f} | {m['RE']['recall']:.3f} | {m['RU']['recall']:.3f} | {m['WA']['recall']:.3f} |")
    animal = report["animalErrorSummary"]
    lines.extend([
        "",
        f"Per-animal record accuracy ranges from {animal['accuracyMin']:.3f} to {animal['accuracyMax']:.3f}; median {animal['accuracyMedian']:.3f}. The five lowest-accuracy animals are listed in the JSON artifact.",
        "",
        "## Repeated timestamps and temporal dependence",
        "",
        f"The raw file has {report['duplicateTimestampAudit']['repeatedAnimalMinuteKeys']} repeated animal-minute keys, including {report['duplicateTimestampAudit']['conflictingLabelKeys']} keys with conflicting behavior labels ({report['duplicateTimestampAudit']['rowsInConflictingLabelKeys']} rows). The frozen OOF file follows its documented policy of collapsing same-label repeats and excluding conflicting keys.",
        "",
        f"Among {report['temporalDependence']['exactlyAdjacentAnimalMinutePairs']} exact one-minute neighbor pairs, observed behavior persistence is {report['temporalDependence']['observedLabelPersistence']:.3f}; OOF prediction persistence is {report['temporalDependence']['predictionPersistence']:.3f}; correctness status persists at {report['temporalDependence']['correctnessStatusPersistence']:.3f}. The source label protocol carries previous labels forward for behaviors shorter than 30 seconds, so persistence is partly annotation-induced.",
        "",
        "## Ranch provenance",
        "",
        "Leave-one-ranch-out is possible from the Figshare record’s breed-to-site mapping: AH and RC are from Jornada Experimental Range (USDA); BR and BH are from Chihuahuan Desert Rangeland Research Center (NMSU). Ranch is not a CSV column, so this grouping is derived from the primary source description. With only two sites, and breed perfectly nested within site, a two-fold result confounds ranch and breed and cannot establish broad site transfer.",
        "",
        "## Preregistered next evaluation (proposal only; not run)",
        "",
        "Use the current six outer grouped-by-animal folds (one animal per breed per fold), and five inner grouped-by-animal folds within each outer training split (one animal per breed per inner fold). Compare only the predeclared univariate threshold rule, multinomial logistic, shallow CART, and causal temporal logistic families specified in the JSON. Fit all cutpoints, scaling, class weights, and hyperparameters inside inner training folds; temporal models use past MI only and reset at time gaps.",
        "",
        "Select by equal-animal-weighted mean F1 for the weak RE and RU classes; tie-break by minimum RE/RU recall, four-class macro-F1, then lower complexity. Report all four classes and per-animal results. Also report a separate two-fold leave-one-ranch-out stress test without using it for model selection. If RE/RU remain weak, report the four-class task as not ready; do not merge labels after seeing the results.",
        "",
        "The input is one scalar motion index, not the raw X/Y/Z signals. This behavior classification diagnostic does not validate DMI, ADG, BR-CORTE, or the Riose engine.",
        "",
        "Machine-readable details: `docs/evidence/perea-behavior-oof-diagnostic.json`.",
        "",
        "Primary source: [Figshare record](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181); article DOI [10.1016/j.atech.2025.101002](https://doi.org/10.1016/j.atech.2025.101002).",
        "",
    ])
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({
        "diagnostic": OUT_JSON.relative_to(ROOT).as_posix(),
        "rows": report["oofCoverage"]["rows"],
        "classFailureRates": {key: value["errorRate"] for key, value in classes.items()},
        "adjacentPairs": report["temporalDependence"]["exactlyAdjacentAnimalMinutePairs"],
        "leaveOneRanchOutPossible": report["ranchProvenance"]["leaveOneRanchOutPossible"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
