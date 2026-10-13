#!/usr/bin/env python3
"""Grouped-by-animal evaluation for Perea et al. behavior labels.

This is a separate sensor behavior classification diagnostic. It does not
evaluate intake, weight gain, BR-CORTE, or the Riose engine.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
REPORT_JSON = ROOT / "docs/evidence/perea-behavior-grouped-evaluation.json"
REPORT_MD = ROOT / "docs/evidence/perea-behavior-grouped-evaluation.md"
PREDICTIONS = ROOT / "docs/evidence/perea-behavior-grouped-oof-predictions.csv"
SOURCE_MD5 = "7cd143e8cccc79a5e159eaa83428529f"
CLASSES = ("GR", "RE", "RU", "WA")
N_FOLDS = 6
SEED = 20261013
L2 = 0.01
MAX_ITERATIONS = 4000
TOLERANCE = 1e-9


def read_observations() -> tuple[list[dict], dict]:
    raw = INPUT.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    if md5 != SOURCE_MD5:
        raise ValueError(f"Perea source MD5 mismatch: {md5}")
    rows_by_key: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    with INPUT.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected = ["Breed", "ID", "Time.MTD", "MI", "State", "Behavior"]
        if reader.fieldnames != expected:
            raise ValueError(f"Unexpected Perea schema: {reader.fieldnames}")
        for line, source in enumerate(reader, start=2):
            breed = source["Breed"].strip()
            animal_id = source["ID"].strip()
            timestamp = datetime.strptime(source["Time.MTD"], "%m/%d/%Y %H:%M")
            motion = float(source["MI"])
            state = source["State"].strip()
            behavior = source["Behavior"].strip()
            if not breed or not animal_id or behavior not in CLASSES or not 0 <= motion <= 30:
                raise ValueError(f"Invalid documented value at CSV line {line}")
            if (behavior in {"GR", "WA"}) != (state == "AC"):
                raise ValueError(f"Behavior/state mismatch at CSV line {line}")
            key = (breed, animal_id, timestamp.strftime("%Y-%m-%dT%H:%M"))
            rows_by_key[key].append({
                "breed": breed,
                "animal_id": animal_id,
                "group_id": f"{breed}:{animal_id}",
                "timestamp": timestamp,
                "motion_index": motion,
                "state": state,
                "behavior": behavior,
                "source_line": line,
            })

    duplicate_keys = {key: values for key, values in rows_by_key.items() if len(values) > 1}
    conflicting = {
        key: values for key, values in duplicate_keys.items()
        if len({row["behavior"] for row in values}) > 1
    }
    kept = []
    for key, values in rows_by_key.items():
        if key in conflicting:
            continue
        # Multiple sensor rows for one labeled animal-minute are represented once;
        # average only the motion index, retaining the unambiguous human label.
        first = values[0].copy()
        first["motion_index"] = sum(row["motion_index"] for row in values) / len(values)
        first["source_rows"] = len(values)
        kept.append(first)
    kept.sort(key=lambda row: (row["group_id"], row["timestamp"], row["source_line"]))
    audit = {
        "publishedRows": sum(len(values) for values in rows_by_key.values()),
        "animalTimestampKeys": len(rows_by_key),
        "repeatedAnimalTimestampKeys": len(duplicate_keys),
        "repeatedRowsBeyondOnePerKey": sum(len(values) - 1 for values in duplicate_keys.values()),
        "exactDuplicateExtraRows": sum(
            len(values) - len({(
                row["breed"], row["animal_id"], row["timestamp"], row["motion_index"],
                row["state"], row["behavior"],
            ) for row in values})
            for values in duplicate_keys.values()
        ),
        "conflictingLabelTimestampKeys": len(conflicting),
        "rowsInConflictingLabelKeysExcluded": sum(len(values) for values in conflicting.values()),
        "sameLabelRepeatedKeysCollapsed": sum(
            1 for key in duplicate_keys if key not in conflicting
        ),
        "analysisRows": len(kept),
        "animalGroups": len({row["group_id"] for row in kept}),
        "duplicateRowsPolicy": (
            "Collapse rows sharing animal and minute to one row by averaging motion index when labels agree; "
            "exclude all rows for a minute when repeated labels conflict. Animal identity remains the CV group."
        ),
    }
    return kept, audit


def make_group_folds(rows: list[dict]) -> dict[str, int]:
    animals_by_breed: dict[str, list[str]] = defaultdict(list)
    for group_id in sorted({row["group_id"] for row in rows}):
        breed, _ = group_id.split(":", 1)
        animals_by_breed[breed].append(group_id)
    if len(animals_by_breed) != 4 or any(len(groups) != 6 for groups in animals_by_breed.values()):
        raise ValueError("Expected six animals in each of four documented breed groups")
    rng = random.Random(SEED)
    group_fold = {}
    for breed in sorted(animals_by_breed):
        groups = animals_by_breed[breed]
        rng.shuffle(groups)
        for fold, group_id in enumerate(groups):
            group_fold[group_id] = fold
    if len(set(group_fold.values())) != N_FOLDS:
        raise ValueError("Unexpected fold assignment")
    return group_fold


def softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=1, keepdims=True)


def fit_logistic(x: np.ndarray, y: np.ndarray, sample_weight: np.ndarray) -> tuple[np.ndarray, float, float, int]:
    mean = float(np.average(x, weights=sample_weight))
    variance = float(np.average((x - mean) ** 2, weights=sample_weight))
    scale = math.sqrt(variance) if variance > 0 else 1.0
    z = (x - mean) / scale
    design = np.column_stack((np.ones(len(z)), z))
    n_classes = len(CLASSES)
    encoded = np.eye(n_classes, dtype=float)[y]
    weights = np.zeros((design.shape[1], n_classes), dtype=float)
    # For standardized one-feature multinomial logistic regression, a fixed
    # conservative full-batch step is stable; L2 regularization applies to slope.
    step = 0.5
    weighted_total = sample_weight.sum()
    previous_loss = float("inf")
    iterations = 0
    for iterations in range(1, MAX_ITERATIONS + 1):
        probabilities = softmax(design @ weights)
        residual = (probabilities - encoded) * sample_weight[:, None]
        gradient = design.T @ residual / weighted_total
        gradient[1, :] += L2 * weights[1, :]
        weights -= step * gradient
        if iterations % 25 == 0 or iterations == 1:
            probs = np.clip(softmax(design @ weights), 1e-15, 1.0)
            loss = -float(np.sum(sample_weight * np.log(probs[np.arange(len(y)), y])) / weighted_total)
            loss += 0.5 * L2 * float(np.sum(weights[1, :] ** 2))
            if abs(previous_loss - loss) < TOLERANCE:
                break
            previous_loss = loss
    return weights, mean, scale, iterations


def predict_logistic(x: np.ndarray, params: tuple[np.ndarray, float, float, int]) -> np.ndarray:
    weights, mean, scale, _ = params
    z = (x - mean) / scale
    design = np.column_stack((np.ones(len(z)), z))
    return softmax(design @ weights).argmax(axis=1)


def metrics(y: np.ndarray, pred: np.ndarray, weights: np.ndarray) -> dict:
    confusion = np.zeros((len(CLASSES), len(CLASSES)), dtype=float)
    for actual, guess, weight in zip(y, pred, weights):
        confusion[int(actual), int(guess)] += float(weight)
    precision, recall, f1 = [], [], []
    per_class = {}
    for index, label in enumerate(CLASSES):
        tp = confusion[index, index]
        support = confusion[index, :].sum()
        predicted = confusion[:, index].sum()
        p = tp / predicted if predicted else 0.0
        r = tp / support if support else 0.0
        f = 2 * p * r / (p + r) if p + r else 0.0
        precision.append(p)
        recall.append(r)
        f1.append(f)
        per_class[label] = {
            "precision": p,
            "recall": r,
            "f1": f,
            "support": support,
        }
    accuracy = float(np.average(y == pred, weights=weights))
    return {
        "accuracy": accuracy,
        "balancedAccuracy": float(np.mean(recall)),
        "macroF1": float(np.mean(f1)),
        "perClass": per_class,
        "confusionMatrixActualRowsPredictedColumns": confusion.tolist(),
    }


def main() -> None:
    rows, duplicate_audit = read_observations()
    groups = make_group_folds(rows)
    y = np.array([CLASSES.index(row["behavior"]) for row in rows], dtype=int)
    x = np.array([row["motion_index"] for row in rows], dtype=float)
    group_ids = np.array([row["group_id"] for row in rows], dtype=object)
    animal_row_counts = Counter(group_ids)
    animal_balanced_weights = np.array([1.0 / animal_row_counts[group] for group in group_ids])
    oof_logistic = np.full(len(rows), -1, dtype=int)
    oof_majority = np.full(len(rows), -1, dtype=int)
    folds = []
    for fold in range(N_FOLDS):
        test = np.array([groups[group] == fold for group in group_ids])
        train = ~test
        train_groups = sorted(set(group_ids[train]))
        test_groups = sorted(set(group_ids[test]))
        overlap = sorted(set(train_groups) & set(test_groups))
        if overlap or len(test_groups) != 4 or len({g.split(":", 1)[0] for g in test_groups}) != 4:
            raise ValueError(f"Animal leakage or imbalanced breed fold {fold}: {overlap}")
        train_counts = Counter(y[train].tolist())
        majority = max(range(len(CLASSES)), key=lambda i: (train_counts[i], -i))
        # Balance classes inside the training fold after balancing animals;
        # no held-out labels influence these weights.
        train_weights = animal_balanced_weights[train].copy()
        class_mass = np.array([
            train_weights[y[train] == i].sum() for i in range(len(CLASSES))
        ])
        class_factors = train_weights.sum() / (len(CLASSES) * class_mass)
        train_weights *= class_factors[y[train]]
        params = fit_logistic(x[train], y[train], train_weights)
        oof_majority[test] = majority
        oof_logistic[test] = predict_logistic(x[test], params)
        folds.append({
            "fold": fold,
            "trainAnimalCount": len(train_groups),
            "testAnimalCount": len(test_groups),
            "trainAnimals": train_groups,
            "testAnimals": test_groups,
            "animalOverlap": overlap,
            "trainClassRows": {CLASSES[i]: train_counts[i] for i in range(len(CLASSES))},
            "testClassRows": {
                CLASSES[i]: int(np.sum(y[test] == i)) for i in range(len(CLASSES))
            },
            "logisticIterations": params[3],
        })
    if np.any(oof_logistic < 0) or np.any(oof_majority < 0):
        raise ValueError("Incomplete out-of-fold predictions")

    observation_weights = np.ones(len(rows), dtype=float)
    report = {
        "classification": "within_source_grouped_by_animal_behavior_classification_diagnostic",
        "source": {
            "title": "Labeled sensor dataset of beef cattle behavior grazing desert rangelands",
            "doi": "10.6084/m9.figshare.28801181.v2",
            "url": "https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181",
            "license": "CC BY 4.0",
            "article": "https://doi.org/10.1016/j.atech.2025.101002",
            "input": INPUT.relative_to(ROOT).as_posix(),
            "inputMd5": hashlib.md5(INPUT.read_bytes()).hexdigest(),
        },
        "scope": {
            "target": "human-reviewed categorical behavior (GR, RE, RU, WA)",
            "predictor": "single 1-minute triaxial-accelerometer motion index (MI)",
            "population": "24 beef cattle across four breeds at two New Mexico ranches; sampled sessions in summer/fall 2022",
            "grain": "one unambiguous animal-minute; repeated same-label timestamps collapsed to one mean MI; conflicting-label timestamps excluded",
            "not_valid_for": ["DMI prediction or calibration", "ADG prediction or validation", "BR-CORTE evaluation", "Riose engine validation", "whole-day activity budgets"],
        },
        "preprocessingAudit": duplicate_audit,
        "candidateScreening": {
            "selected": {
                "source": "Perea et al., data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv",
                "labelsAndMethod": "Human annotations synchronized from video to 1-minute animal rows; four behavior classes GR/RE/RU/WA plus derived active/static state; one-dimensional MI summarized from tri-axial accelerometry.",
                "identityAndGrain": "Breed and ear-tag ID support 24 animal groups; timestamps permit animal-minute duplicate audit.",
                "existingEvaluation": "The local source audit records that the paper reports classification experiments, but no local reproducible grouped-by-animal evaluation existed; this artifact performs one.",
            },
            "notPooled": [
                {
                    "source": "Grazing ingestive behavior compilation (10.57745/RPDBI6)",
                    "localEvidence": "docs/evidence/grazing-ingestive-behavior-audit.json",
                    "populationAndGrain": "676 treatment/experimental-condition rows aggregated from 90 papers and 199 experiments across ruminants.",
                    "outcomesAndMethod": "Literature-coded intake rate (g DMI/min), DMI/BW, and rate/BW; no time-aligned sensor feature, individual animal identifier, or row-level behavior classification labels.",
                    "decision": "Not a behavior-classification cohort; keep as a separate literature summary and do not pool with Perea.",
                },
                {
                    "source": "USDA/CPER 2019-2020 (10.15482/USDA.ADC/1524788)",
                    "localEvidence": "docs/evidence/usda-cper-association.json",
                    "populationAndGrain": "33 yearling steers, 36 animal-period rows, three 60-day intervals; Eartag identifies animals.",
                    "outcomesAndMethod": "Observed ADG_60d in kg/steer/day associated descriptively with grazing-bout duration (5-minute resolution) and mean grazing velocity (m/min); behavior variables are period summaries, not behavior-class labels aligned to a sensor feature.",
                    "existingEvaluation": "docs/evidence/usda-cper-association.json reports pooled and adjusted within-study observational rank associations with animal-cluster bootstrap; it is not a classifier or external validation.",
                    "decision": "Do not use as behavior-classification training/evaluation and do not merge with Perea; it remains a separate ADG-pastejo association cohort.",
                },
            ],
        },
        "evaluation": {
            "method": "six-fold grouped out-of-fold evaluation; each fold with one animal from each breed; all rows from each Breed:ID stay in one held-out fold",
            "foldSeed": SEED,
            "noAnimalOverlap": all(not fold["animalOverlap"] for fold in folds),
            "model": "multinomial logistic regression using only MI; training-fold weighted centering/scaling; training-fold weights equalize animal contribution and then class mass; L2=0.01",
            "baseline": "training-fold majority behavior class",
            "metrics": {
                "logistic_observation_weighted": metrics(y, oof_logistic, observation_weights),
                "logistic_equal_animal_weighted": metrics(y, oof_logistic, animal_balanced_weights),
                "majority_observation_weighted": metrics(y, oof_majority, observation_weights),
                "majority_equal_animal_weighted": metrics(y, oof_majority, animal_balanced_weights),
            },
            "perAnimalAccuracy": {
                group: float(np.mean(oof_logistic[group_ids == group] == y[group_ids == group]))
                for group in sorted(set(group_ids))
            },
            "folds": folds,
        },
        "limitations": [
            "This is internal held-out-animal evaluation within one source, not external validation on a second ranch, study, sensor, or season.",
            "The predictor is only one scalar motion index; no raw three-axis signals, GPS, forage state, animal physiology, or individual intake is included.",
            "The 24 animals form a small and geographically narrow sample; observations are repeated minutes, not independent animals.",
            "The source reports 290 animal-timestamp keys with repeated rows; 54 keys have conflicting behavior labels. The analysis excludes all rows from those 54 keys and collapses other repeated keys to avoid duplicate weighting.",
            "Labels are minute-level annotations from video, with the source protocol carrying a previous label forward for behaviors shorter than 30 seconds; class errors and temporal label autocorrelation remain possible.",
            "Held-out animals can still share ranch, breed-specific management, season, and collection conditions with training animals; performance does not establish cross-site transfer.",
        ],
        "reproducibility": {
            "script": "scripts/evaluate_perea_behavior_grouped.py",
            "predictions": PREDICTIONS.relative_to(ROOT).as_posix(),
            "predictionSha256": None,
            "dependencies": ["Python standard library", "NumPy"],
            "deterministic": True,
        },
    }
    with PREDICTIONS.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["breed", "animal_id", "timestamp_mountain_time", "motion_index", "behavior_observed", "behavior_oof_logistic", "behavior_oof_majority", "fold", "source_rows_collapsed"])
        for row, actual, predicted, majority in zip(rows, y, oof_logistic, oof_majority):
            writer.writerow([
                row["breed"], row["animal_id"], row["timestamp"].isoformat(timespec="minutes"),
                f"{row['motion_index']:.8g}", CLASSES[actual], CLASSES[predicted], CLASSES[majority],
                groups[row["group_id"]], row["source_rows"],
            ])
    report["reproducibility"]["predictionSha256"] = hashlib.sha256(PREDICTIONS.read_bytes()).hexdigest()
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = report["evaluation"]["metrics"]
    lines = [
        "# Perea behavior classification: grouped-by-animal evaluation",
        "",
        "This is a bounded behavior-classification diagnostic using the public Perea et al. v2 data. It does not validate DMI, ADG, BR-CORTE, or the Riose engine.",
        "",
        f"Source: [Figshare dataset](https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181), DOI [10.6084/m9.figshare.28801181.v2](https://doi.org/10.6084/m9.figshare.28801181.v2), CC BY 4.0.",
        "",
        "## Method",
        "",
        "A six-fold out-of-fold split holds out four animals in each fold, one from each of the four breeds. All observations for a `Breed:ID` remain together. The model is a regularized multinomial logistic regression using only the published one-minute motion index; scaling is fit on training animals only and training weights equalize each animal, then class mass. The baseline predicts the training-fold majority class.",
        "",
        f"The published file has {duplicate_audit['publishedRows']:,} rows. Repeated animal-minute keys are collapsed to one mean motion index when labels agree; all rows for the {duplicate_audit['conflictingLabelTimestampKeys']} timestamps with conflicting behavior labels are excluded. The evaluation has {duplicate_audit['analysisRows']:,} rows from {duplicate_audit['animalGroups']} animals.",
        "",
        "## Out-of-fold metrics",
        "",
        "| Model | Record-weighted accuracy | Record-weighted balanced accuracy | Record-weighted macro F1 | Equal-animal accuracy | Equal-animal balanced accuracy | Equal-animal macro F1 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for model, label in [("logistic", "MI logistic"), ("majority", "Majority baseline")]:
        record = summary[f"{model}_observation_weighted"]
        animal = summary[f"{model}_equal_animal_weighted"]
        lines.append(
            f"| {label} | {record['accuracy']:.3f} | {record['balancedAccuracy']:.3f} | {record['macroF1']:.3f} | {animal['accuracy']:.3f} | {animal['balancedAccuracy']:.3f} | {animal['macroF1']:.3f} |"
        )
    lines.extend([
        "",
        "## Source selection and separation",
        "",
        "Perea is selected because its rows pair a timestamped animal identity and sensor motion index with human-reviewed behavior labels. The local audit of the Grazing Ingestive Behavior compilation shows 676 treatment-level rows from 90 papers/199 experiments, with intake-rate fields but no individual/time-aligned behavior labels. The local CPER audit has 36 animal-period rows for 33 identified yearling steers, ADG outcomes, and period summaries of bout duration/velocity; its existing animal-cluster analysis is an ADG association, not a behavior classifier. These sources stay separate and none is used to score the Perea model.",
        "",
        "## Limits",
        "",
        "This is internal held-out-animal evidence from one dataset, not an external-site test. The 24 animals share collection context; the model uses one scalar motion index rather than raw accelerometer axes. The source labels are one-minute annotations, some timestamps have conflicting labels, and temporal autocorrelation remains. No result here supports DMI, ADG, or whole-engine claims.",
        "",
        f"Reproduce with `python3 scripts/evaluate_perea_behavior_grouped.py`. Machine-readable details: `docs/evidence/perea-behavior-grouped-evaluation.json`; OOF rows: `docs/evidence/perea-behavior-grouped-oof-predictions.csv`.",
        "",
    ])
    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({
        "rows": duplicate_audit["analysisRows"],
        "animals": duplicate_audit["animalGroups"],
        "logisticEqualAnimal": summary["logistic_equal_animal_weighted"],
        "majorityEqualAnimal": summary["majority_equal_animal_weighted"],
        "report": REPORT_JSON.relative_to(ROOT).as_posix(),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
