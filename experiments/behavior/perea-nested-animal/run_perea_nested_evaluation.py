#!/usr/bin/env python3
"""Run the preregistered nested animal-held-out Perea behavior evaluation."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PREREG_PATH = ROOT / "experiments/diagnostics/behavior/preregister-perea-nested-animal-evaluation-2026-10.json"
SOURCE_PATH = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
CLASSES = ("GR", "RE", "RU", "WA")
CLASS_INDEX = {name: i for i, name in enumerate(CLASSES)}
FEATURE_NAMES = ("MI_t", "MI_t-1", "MI_t-2", "MI_t-3", "MI_t-4")


def load_preregistration() -> dict:
    return json.loads(PREREG_PATH.read_text(encoding="utf-8"))


def read_clean_rows(source_path: Path = SOURCE_PATH, expected_md5: str | None = None) -> tuple[list[dict], dict]:
    raw = source_path.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    if expected_md5 and md5 != expected_md5:
        raise ValueError(f"Source MD5 mismatch: expected {expected_md5}, got {md5}")

    by_key: dict[tuple[str, datetime], list[dict]] = defaultdict(list)
    with source_path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected_fields = ["Breed", "ID", "Time.MTD", "MI", "State", "Behavior"]
        if reader.fieldnames != expected_fields:
            raise ValueError(f"Unexpected Perea columns: {reader.fieldnames}")
        for source_row, raw_row in enumerate(reader, start=2):
            breed = raw_row["Breed"].strip()
            animal_id = raw_row["ID"].strip()
            timestamp = datetime.strptime(raw_row["Time.MTD"], "%m/%d/%Y %H:%M")
            motion = float(raw_row["MI"])
            label = raw_row["Behavior"].strip()
            state = raw_row["State"].strip()
            if not breed or not animal_id or label not in CLASS_INDEX or not 0 <= motion <= 30:
                raise ValueError(f"Invalid documented value at source row {source_row}")
            if (label in {"GR", "WA"}) != (state == "AC"):
                raise ValueError(f"Behavior/state mismatch at source row {source_row}")
            animal = f"{breed}:{animal_id}"
            by_key[(animal, timestamp)].append({
                "breed": breed,
                "animal_id": animal_id,
                "animal": animal,
                "timestamp": timestamp,
                "mi": motion,
                "label": label,
                "source_row": source_row,
            })

    conflicts = {key: group for key, group in by_key.items() if len({row["label"] for row in group}) > 1}
    kept = []
    for (animal, timestamp), group in by_key.items():
        if (animal, timestamp) in conflicts:
            continue
        first = group[0].copy()
        first["mi"] = sum(row["mi"] for row in group) / len(group)
        first["source_rows_collapsed"] = len(group)
        kept.append(first)
    kept.sort(key=lambda row: (row["animal"], row["timestamp"], row["source_row"]))
    audit = {
        "publishedRows": sum(map(len, by_key.values())),
        "animalTimestampKeys": len(by_key),
        "repeatedAnimalTimestampKeys": sum(len(group) > 1 for group in by_key.values()),
        "conflictingLabelTimestampKeys": len(conflicts),
        "rowsInConflictingLabelKeysExcluded": sum(map(len, conflicts.values())),
        "sameLabelRepeatedKeysCollapsed": sum(len(group) > 1 and len({r["label"] for r in group}) == 1 for group in by_key.values()),
        "analysisRows": len(kept),
        "animalGroups": len({row["animal"] for row in kept}),
    }
    return kept, audit


def make_temporal_rows(rows: list[dict]) -> list[dict]:
    """Attach MI_t..MI_t-4 only inside uninterrupted one-minute animal runs."""
    by_animal: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_animal[row["animal"]].append(row)
    result = []
    one_minute = timedelta(minutes=1)
    for animal in sorted(by_animal):
        ordered = sorted(by_animal[animal], key=lambda row: row["timestamp"])
        segment: list[dict] = []

        def flush() -> None:
            for end in range(4, len(segment)):
                current = segment[end]
                enriched = current.copy()
                enriched["features"] = [segment[end - lag]["mi"] for lag in range(5)]
                enriched["feature_names"] = list(FEATURE_NAMES)
                result.append(enriched)

        for row in ordered:
            if segment and row["timestamp"] - segment[-1]["timestamp"] != one_minute:
                flush()
                segment = []
            segment.append(row)
        flush()
    result.sort(key=lambda row: (row["animal"], row["timestamp"], row["source_row"]))
    return result


def make_inner_fold_map(outer_train_animals: list[str]) -> dict[str, int]:
    """Assign sorted remaining IDs within each breed round-robin to five folds."""
    by_breed: dict[str, list[str]] = defaultdict(list)
    for animal in outer_train_animals:
        breed, animal_id = animal.split(":", 1)
        by_breed[breed].append(animal)
    if len(by_breed) != 4 or any(len(groups) != 5 for groups in by_breed.values()):
        raise ValueError("Each outer training set must contain five animals in each of four breeds")
    assignments = {}
    for breed, groups in sorted(by_breed.items()):
        groups.sort(key=lambda group: group.split(":", 1)[1])
        for fold, animal in enumerate(groups):
            assignments[animal] = fold
    return assignments


def row_weights(groups: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Equalize animal contributions, then equalize total class mass."""
    counts = Counter(groups.tolist())
    weights = np.array([1.0 / counts[group] for group in groups], dtype=float)
    class_mass = np.array([weights[labels == i].sum() for i in range(len(CLASSES))])
    if np.any(class_mass == 0):
        raise ValueError("Training fold is missing one or more behavior classes")
    factors = weights.sum() / (len(CLASSES) * class_mass)
    weights *= factors[labels]
    return weights


def candidate_specs(prereg: dict) -> list[dict]:
    return prereg["nestedSelection"]["fixedCandidates"]


def complexity_rank(candidate: dict) -> tuple[int, float]:
    cid = candidate["id"]
    if cid == "static_logistic":
        return (0, 0.0)
    if cid.startswith("temporal_logistic_c_"):
        c = float(cid.split("temporal_logistic_c_", 1)[1].replace("_", "."))
        return (1, c)
    if cid.startswith("cart_depth_"):
        return (2, float(cid.rsplit("_", 1)[1]))
    raise ValueError(f"Unknown candidate {cid}")


def static_logistic_fit(x: np.ndarray, y: np.ndarray, weights: np.ndarray) -> dict:
    mean = np.average(x[:, 0], weights=weights)
    variance = np.average((x[:, 0] - mean) ** 2, weights=weights)
    scale = math.sqrt(variance) if variance > 0 else 1.0
    design = np.column_stack((np.ones(len(x)), (x[:, 0] - mean) / scale))
    encoded = np.eye(len(CLASSES), dtype=float)[y]
    params = np.zeros((design.shape[1], len(CLASSES)), dtype=float)
    step = 0.5
    total = weights.sum()
    previous_loss = float("inf")
    iterations = 0
    for iterations in range(1, 4001):
        logits = design @ params
        logits -= logits.max(axis=1, keepdims=True)
        probs = np.exp(logits)
        probs /= probs.sum(axis=1, keepdims=True)
        grad = design.T @ ((probs - encoded) * weights[:, None]) / total
        grad[1, :] += 0.01 * params[1, :]
        params -= step * grad
        if iterations % 25 == 0 or iterations == 1:
            logits = design @ params
            logits -= logits.max(axis=1, keepdims=True)
            p = np.exp(logits)
            p /= p.sum(axis=1, keepdims=True)
            loss = -float(np.sum(weights * np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1.0))) / total)
            loss += 0.005 * float(np.sum(params[1, :] ** 2))
            if abs(previous_loss - loss) < 1e-9:
                break
            previous_loss = loss
    return {"kind": "static", "params": params, "mean": float(mean), "scale": float(scale), "iterations": iterations}


def fit_candidate(candidate: dict, x: np.ndarray, y: np.ndarray, groups: np.ndarray) -> dict:
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from sklearn.tree import DecisionTreeClassifier

    weights = row_weights(groups, y)
    cid = candidate["id"]
    if cid == "static_logistic":
        return static_logistic_fit(x[:, :1], y, weights)
    if cid.startswith("temporal_logistic_c_"):
        c = float(cid.split("temporal_logistic_c_", 1)[1].replace("_", "."))
        scaler = StandardScaler()
        x_scaled = scaler.fit_transform(x, sample_weight=weights)
        model = LogisticRegression(
            C=c, penalty="l2", solver="lbfgs", max_iter=5000, tol=1e-10,
            fit_intercept=True, random_state=None,
        )
        model.fit(x_scaled, y, sample_weight=weights)
        return {"kind": "sklearn_logistic", "scaler": scaler, "model": model}
    if cid.startswith("cart_depth_"):
        depth = int(cid.rsplit("_", 1)[1])
        model = DecisionTreeClassifier(max_depth=depth, min_samples_leaf=20, random_state=20261013)
        model.fit(x, y, sample_weight=weights)
        return {"kind": "tree", "model": model}
    raise ValueError(f"Unknown candidate {cid}")


def predict_candidate(fitted: dict, candidate: dict, x: np.ndarray) -> np.ndarray:
    if fitted["kind"] == "static":
        design = np.column_stack((np.ones(len(x)), (x[:, 0] - fitted["mean"]) / fitted["scale"]))
        logits = design @ fitted["params"]
        return logits.argmax(axis=1)
    if fitted["kind"] == "sklearn_logistic":
        return fitted["model"].predict(fitted["scaler"].transform(x)).astype(int)
    return fitted["model"].predict(x).astype(int)


def per_animal_confusions(y: np.ndarray, pred: np.ndarray, groups: np.ndarray) -> dict[str, np.ndarray]:
    output = {}
    for group in sorted(set(groups.tolist())):
        matrix = np.zeros((len(CLASSES), len(CLASSES)), dtype=float)
        mask = groups == group
        for actual, guess in zip(y[mask], pred[mask]):
            matrix[int(actual), int(guess)] += 1.0
        output[group] = matrix
    return output


def scores_from_predictions(y: np.ndarray, pred: np.ndarray, groups: np.ndarray) -> dict:
    matrices = per_animal_confusions(y, pred, groups)
    per_animal = {}
    for animal, matrix in matrices.items():
        per_class = {}
        for i, label in enumerate(CLASSES):
            tp = matrix[i, i]
            support = matrix[i].sum()
            predicted = matrix[:, i].sum()
            precision = tp / predicted if predicted else 0.0
            recall = tp / support if support else 0.0
            f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
            per_class[label] = {"precision": precision, "recall": recall, "f1": f1, "support": int(support)}
        per_animal[animal] = {
            "accuracy": float(np.trace(matrix) / matrix.sum()),
            "perClass": per_class,
            "macroF1": float(np.mean([per_class[c]["f1"] for c in CLASSES])),
        }
    equal_class = {
        label: {
            metric: float(np.mean([row["perClass"][label][metric] for row in per_animal.values()]))
            for metric in ("precision", "recall", "f1")
        }
        for label in CLASSES
    }
    pooled = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    for animal, matrix in matrices.items():
        pooled += matrix.astype(int)
    return {
        "primaryEqualAnimalMeanF1_RE_RU": float((equal_class["RE"]["f1"] + equal_class["RU"]["f1"]) / 2),
        "equalAnimalMeanRecall_RE_RU": {
            "RE": equal_class["RE"]["recall"],
            "RU": equal_class["RU"]["recall"],
        },
        "tieBreakMinimumWeakClassRecall": float(min(equal_class["RE"]["recall"], equal_class["RU"]["recall"])),
        "equalAnimalMacroF1": float(np.mean([row["macroF1"] for row in per_animal.values()])),
        "equalAnimalPerClass": equal_class,
        "observationWeightedAccuracy": float(np.mean(y == pred)),
        "confusionMatrixActualRowsPredictedColumns": pooled.tolist(),
        "perAnimal": per_animal,
    }


def select_candidate(inner_scores: dict[str, dict], specs: list[dict]) -> tuple[str, list[dict]]:
    by_id = {spec["id"]: spec for spec in specs}
    rankings = []
    for cid, score in inner_scores.items():
        rankings.append({
            "candidate": cid,
            "primary": score["primaryEqualAnimalMeanF1_RE_RU"],
            "minimumWeakClassRecall": score["tieBreakMinimumWeakClassRecall"],
            "equalAnimalMacroF1": score["equalAnimalMacroF1"],
            "complexityRank": complexity_rank(by_id[cid]),
        })
    rankings.sort(key=lambda row: (
        -row["primary"], -row["minimumWeakClassRecall"], -row["equalAnimalMacroF1"], row["complexityRank"]
    ))
    return rankings[0]["candidate"], rankings


def evaluate_outer_fold(rows: list[dict], outer_fold: dict, specs: list[dict]) -> dict:
    test_animals = set(outer_fold["testAnimals"])
    train_rows = [row for row in rows if row["animal"] not in test_animals]
    test_rows = [row for row in rows if row["animal"] in test_animals]
    train_animals = sorted({row["animal"] for row in train_rows})
    if set(train_animals) & test_animals or len(test_animals) != 4 or len(train_animals) != 20:
        raise AssertionError(f"Outer animal isolation failed for fold {outer_fold['fold']}")

    inner_map = make_inner_fold_map(train_animals)
    inner_oof = {spec["id"]: {} for spec in specs}
    inner_fold_details = []
    for inner_fold in range(5):
        inner_test_animals = {animal for animal, assigned in inner_map.items() if assigned == inner_fold}
        inner_train_animals = set(train_animals) - inner_test_animals
        if len(inner_test_animals) != 4 or len(inner_train_animals) != 16 or inner_train_animals & inner_test_animals:
            raise AssertionError(f"Inner animal isolation failed: outer={outer_fold['fold']}, inner={inner_fold}")
        inner_train = [row for row in train_rows if row["animal"] in inner_train_animals]
        inner_test = [row for row in train_rows if row["animal"] in inner_test_animals]
        y_train = np.array([CLASS_INDEX[row["label"]] for row in inner_train], dtype=int)
        y_valid = np.array([CLASS_INDEX[row["label"]] for row in inner_test], dtype=int)
        g_train = np.array([row["animal"] for row in inner_train], dtype=object)
        x_train = np.array([row["features"] for row in inner_train], dtype=float)
        x_valid = np.array([row["features"] for row in inner_test], dtype=float)
        for spec in specs:
            fitted = fit_candidate(spec, x_train, y_train, g_train)
            predicted = predict_candidate(fitted, spec, x_valid)
            inner_oof[spec["id"]].update({id(row): int(value) for row, value in zip(inner_test, predicted)})
        inner_fold_details.append({
            "fold": inner_fold,
            "trainAnimals": sorted(inner_train_animals),
            "validationAnimals": sorted(inner_test_animals),
            "animalOverlap": sorted(inner_train_animals & inner_test_animals),
            "trainRows": len(inner_train),
            "validationRows": len(inner_test),
        })

    inner_scores = {}
    for spec in specs:
        cid = spec["id"]
        ordered_rows = train_rows
        if len(inner_oof[cid]) != len(ordered_rows):
            raise AssertionError(f"Incomplete inner OOF coverage for {cid}")
        inner_scores[cid] = scores_from_predictions(
            np.array([CLASS_INDEX[row["label"]] for row in ordered_rows], dtype=int),
            np.array([inner_oof[cid][id(row)] for row in ordered_rows], dtype=int),
            np.array([row["animal"] for row in ordered_rows], dtype=object),
        )
    selected, rankings = select_candidate(inner_scores, specs)

    y_train = np.array([CLASS_INDEX[row["label"]] for row in train_rows], dtype=int)
    y_test = np.array([CLASS_INDEX[row["label"]] for row in test_rows], dtype=int)
    g_train = np.array([row["animal"] for row in train_rows], dtype=object)
    x_train = np.array([row["features"] for row in train_rows], dtype=float)
    x_test = np.array([row["features"] for row in test_rows], dtype=float)
    candidate_outer_predictions = {}
    for spec in specs:
        fitted = fit_candidate(spec, x_train, y_train, g_train)
        candidate_outer_predictions[spec["id"]] = predict_candidate(fitted, spec, x_test)
    majority = Counter(y_train.tolist()).most_common(1)[0][0]
    return {
        "fold": outer_fold["fold"],
        "trainAnimals": train_animals,
        "testAnimals": sorted(test_animals),
        "animalOverlap": sorted(set(train_animals) & test_animals),
        "trainRows": len(train_rows),
        "testRows": len(test_rows),
        "trainClassRows": {label: int(np.sum(y_train == i)) for i, label in enumerate(CLASSES)},
        "testClassRows": {label: int(np.sum(y_test == i)) for i, label in enumerate(CLASSES)},
        "innerFoldMap": inner_map,
        "innerFolds": inner_fold_details,
        "innerSelectionScores": inner_scores,
        "innerRanking": rankings,
        "selectedCandidate": selected,
        "testLabels": y_test,
        "testRowsData": test_rows,
        "outerPredictions": candidate_outer_predictions,
        "majorityPredictions": np.full(len(test_rows), majority, dtype=int),
    }


def make_report_rows(rows: list[dict], outer_folds: list[dict], specs: list[dict]) -> tuple[dict, list[dict]]:
    results = [evaluate_outer_fold(rows, fold, specs) for fold in outer_folds]
    predictions_by_candidate = {spec["id"]: {} for spec in specs}
    selected_predictions = {}
    majority_predictions = {}
    fold_by_animal = {}
    per_fold_metrics = {}
    for result in results:
        fold = result["fold"]
        for animal in result["testAnimals"]:
            if animal in fold_by_animal:
                raise AssertionError(f"Animal appears in multiple outer test folds: {animal}")
            fold_by_animal[animal] = fold
        for row_index, row in enumerate(result["testRowsData"]):
            key = id(row)
            for cid in predictions_by_candidate:
                predictions_by_candidate[cid][key] = int(result["outerPredictions"][cid][row_index])
            selected_predictions[key] = int(result["outerPredictions"][result["selectedCandidate"]][row_index])
            majority_predictions[key] = int(result["majorityPredictions"][row_index])
        fold_rows = result["testRowsData"]
        per_fold_metrics[str(fold)] = {
            "selectedCandidate": result["selectedCandidate"],
            "testAnimals": result["testAnimals"],
            "trainAnimals": result["trainAnimals"],
            "animalOverlap": result["animalOverlap"],
            "innerFolds": result["innerFolds"],
            "innerRanking": result["innerRanking"],
            "selected": scores_from_predictions(
                result["testLabels"],
                result["outerPredictions"][result["selectedCandidate"]],
                np.array([row["animal"] for row in fold_rows], dtype=object),
            ),
            "candidates": {
                cid: scores_from_predictions(
                    result["testLabels"], pred,
                    np.array([row["animal"] for row in fold_rows], dtype=object),
                ) for cid, pred in result["outerPredictions"].items()
            },
            "majority": scores_from_predictions(
                result["testLabels"], result["majorityPredictions"],
                np.array([row["animal"] for row in fold_rows], dtype=object),
            ),
        }

    ordered = rows
    y = np.array([CLASS_INDEX[row["label"]] for row in ordered], dtype=int)
    groups = np.array([row["animal"] for row in ordered], dtype=object)
    candidate_metrics = {
        cid: scores_from_predictions(y, np.array([predictions_by_candidate[cid][id(row)] for row in ordered]), groups)
        for cid in predictions_by_candidate
    }
    nested_metrics = scores_from_predictions(y, np.array([selected_predictions[id(row)] for row in ordered]), groups)
    majority_metrics = scores_from_predictions(y, np.array([majority_predictions[id(row)] for row in ordered]), groups)
    selected_counts = Counter(result["selectedCandidate"] for result in results)
    report_results = {
        "nestedSelectedModel": nested_metrics,
        "fixedCandidatesOuterOOFDescriptive": candidate_metrics,
        "majorityReference": majority_metrics,
        "selectedCandidateCountsAcrossOuterFolds": dict(sorted(selected_counts.items())),
        "outerFolds": per_fold_metrics,
    }
    prediction_rows = []
    for row in ordered:
        key = id(row)
        fold = fold_by_animal[row["animal"]]
        prediction_rows.append({
            **row,
            "outer_fold": fold,
            "selected_candidate": next(r["selectedCandidate"] for r in results if r["fold"] == fold),
            "selected_prediction": CLASSES[selected_predictions[key]],
            "majority_prediction": CLASSES[majority_predictions[key]],
            **{f"pred_{cid}": CLASSES[predictions_by_candidate[cid][key]] for cid in predictions_by_candidate},
        })
    return report_results, prediction_rows


def run() -> dict:
    prereg = load_preregistration()
    rows, duplicate_audit = read_clean_rows(SOURCE_PATH, prereg["source"]["md5"])
    if len(rows) != prereg["source"]["deduplicatedRows"]:
        raise ValueError(f"Expected {prereg['source']['deduplicatedRows']} cleaned rows; found {len(rows)}")
    temporal_rows = make_temporal_rows(rows)
    expected_temporal = prereg["preprocessing"]["commonTemporalRowsExpected"]
    if len(temporal_rows) != expected_temporal:
        raise ValueError(f"Expected {expected_temporal} temporally complete rows; found {len(temporal_rows)}")
    specs = candidate_specs(prereg)
    static_reference = json.loads((ROOT / "docs/evidence/perea-behavior-grouped-evaluation.json").read_text(encoding="utf-8"))
    outer_folds = prereg["outerEvaluation"]["assignmentsFromFrozenExistingEvaluation"]
    expected_animals = {row["animal"] for row in temporal_rows}
    assigned = [animal for fold in outer_folds for animal in fold["testAnimals"]]
    if len(assigned) != len(set(assigned)) or set(assigned) != expected_animals:
        raise ValueError("Frozen outer folds do not cover each temporal-analysis animal exactly once")

    results, prediction_rows = make_report_rows(temporal_rows, outer_folds, specs)
    report = {
        "kind": "preregistered_nested_grouped_by_animal_behavior_evaluation",
        "preregistration": {
            "file": PREREG_PATH.relative_to(ROOT).as_posix(),
            "registeredAt": prereg["registeredAt"],
            "sourceMd5": prereg["source"]["md5"],
            "candidates": specs,
            "outerAssignments": outer_folds,
            "innerFoldRule": prereg["nestedSelection"]["innerFolds"],
            "primaryMetric": prereg["nestedSelection"]["primaryMetric"],
            "tieBreakers": prereg["nestedSelection"]["tieBreakers"],
        },
        "source": {
            "doi": prereg["source"]["doi"],
            "license": prereg["source"]["license"],
            "file": prereg["source"]["file"],
            "md5": hashlib.md5(SOURCE_PATH.read_bytes()).hexdigest(),
        },
        "preprocessing": {
            **duplicate_audit,
            "temporalRows": len(temporal_rows),
            "temporalRowsOmitted": len(rows) - len(temporal_rows),
            "features": list(FEATURE_NAMES),
            "windowRule": "MI_t and four prior MI values at exactly one-minute intervals, within the same animal; gaps reset the feature history; no outcome labels are features.",
        },
        "evaluation": results,
        "staticAllRowsReference": {
            "path": "docs/evidence/perea-behavior-grouped-evaluation.json",
            "rows": prereg["source"]["deduplicatedRows"],
            "metrics": {
                "frozenStaticLogisticObservationWeighted": static_reference["evaluation"]["metrics"]["logistic_observation_weighted"],
                "frozenStaticLogisticEqualAnimalWeighted": static_reference["evaluation"]["metrics"]["logistic_equal_animal_weighted"],
                "frozenMajorityObservationWeighted": static_reference["evaluation"]["metrics"]["majority_observation_weighted"],
                "frozenMajorityEqualAnimalWeighted": static_reference["evaluation"]["metrics"]["majority_equal_animal_weighted"],
            },
            "note": "Frozen existing static-only six-fold results on all 8,864 rows; not directly comparable to the 5,582-row temporally complete subset.",
        },
        "limitations": [
            "Metrics estimate held-out-animal performance within the sampled source; all outer folds reuse both ranches and all four breeds.",
            "The source contains 24 animals and repeated minute observations; the effective independent groups are animals, not rows.",
            "Only one scalar motion index is available; no raw axes or physiology are evaluated.",
            "Behavior labels are video-reviewed minute annotations; short behaviors may inherit labels from adjacent minutes, so temporal performance can benefit from annotation persistence.",
            "This behavior task does not validate DMI, ADG, BR-CORTE, lameness, or the Riose engine.",
            "Outer candidate metrics are descriptive; only inner grouped predictions select the model in each outer fold.",
        ],
        "reproducibility": {
            "script": (HERE / "run_perea_nested_evaluation.py").relative_to(ROOT).as_posix(),
            "predictionFile": (HERE / "predictions.csv").relative_to(ROOT).as_posix(),
            "dependencies": ["Python standard library", "NumPy", "scikit-learn"],
            "deterministic": True,
        },
    }
    HERE.mkdir(parents=True, exist_ok=True)
    with (HERE / "predictions.csv").open("w", encoding="utf-8", newline="") as handle:
        fields = ["breed", "animal_id", "animal", "timestamp", "MI_t", "MI_t-1", "MI_t-2", "MI_t-3", "MI_t-4", "behavior_observed", "outer_fold", "selected_candidate", "selected_prediction", "majority_prediction"] + [f"pred_{spec['id']}" for spec in specs]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in prediction_rows:
            writer.writerow({
                "breed": row["breed"], "animal_id": row["animal_id"], "animal": row["animal"],
                "timestamp": row["timestamp"].isoformat(timespec="minutes"),
                **{name: f"{row['features'][i]:.8g}" for i, name in enumerate(FEATURE_NAMES)},
                "behavior_observed": row["label"], "outer_fold": row["outer_fold"],
                "selected_candidate": row["selected_candidate"], "selected_prediction": row["selected_prediction"],
                "majority_prediction": row["majority_prediction"],
                **{f"pred_{spec['id']}": row[f"pred_{spec['id']}"] for spec in specs},
            })
    report["reproducibility"]["predictionSha256"] = hashlib.sha256((HERE / "predictions.csv").read_bytes()).hexdigest()
    (HERE / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "results.md").write_text(render_markdown(report), encoding="utf-8")
    return report


def render_markdown(report: dict) -> str:
    metrics = report["evaluation"]["nestedSelectedModel"]
    lines = [
        "# Perea nested behavior evaluation",
        "",
        "Preregistered nested evaluation of video-reviewed pasture behavior labels from Perea et al. This is a within-source held-out-animal diagnostic; it does not validate DMI, ADG, BR-CORTE, lameness, or the Riose engine.",
        "",
        f"Source: [Figshare dataset](https://doi.org/{report['source']['doi']}), license {report['source']['license']}; source checksum `{report['source']['md5']}`.",
        "",
        "## Protocol",
        "",
        f"The audit retained {report['preprocessing']['analysisRows']:,} unique animal-minute rows from {report['preprocessing']['animalGroups']} animals after same-label duplicate collapse and conflicting-label exclusion. The common temporal analysis contains {report['preprocessing']['temporalRows']:,} rows; {report['preprocessing']['temporalRowsOmitted']:,} rows without four consecutive prior minutes are omitted from every candidate comparison.",
        "",
        "Features are `[MI_t, MI_t-1, MI_t-2, MI_t-3, MI_t-4]`, generated within animal and reset at every timestamp gap. No future MI, behavior history, site, breed, or animal identifier is a model feature. Six outer folds use the already frozen animal assignments. In each outer training set, the five remaining animals per breed are sorted by ID and assigned one per inner fold. Each inner split holds four animals (one per breed); the other 16 animals train the candidate.",
        "",
        "Seven fixed candidates were compared using identical temporal-complete rows: static MI logistic, three lagged logistic settings (`C=0.1, 1, 10`), and lagged CART (`max_depth=2, 3, 4`, `min_samples_leaf=20`). Scaling and class/animal weights are fit inside each training split. The inner score is the equal-animal mean of per-animal RE/RU F1, followed by minimum RE/RU recall, equal-animal macro-F1, and preregistered complexity order. Outer labels were used only for post-selection reporting.",
        "",
        "## Nested selected OOF results",
        "",
        f"Selected candidate counts across six outer folds: `{json.dumps(report['evaluation']['selectedCandidateCountsAcrossOuterFolds'], sort_keys=True)}`.",
        "",
        "| Metric | Value |",
        "|---|---:|",
        f"| Equal-animal mean F1, RE/RU (primary) | {metrics['primaryEqualAnimalMeanF1_RE_RU']:.3f} |",
        f"| Equal-animal RE recall | {metrics['equalAnimalMeanRecall_RE_RU']['RE']:.3f} |",
        f"| Equal-animal RU recall | {metrics['equalAnimalMeanRecall_RE_RU']['RU']:.3f} |",
        f"| Equal-animal four-class macro-F1 | {metrics['equalAnimalMacroF1']:.3f} |",
        f"| Observation-weighted accuracy | {metrics['observationWeightedAccuracy']:.3f} |",
        "",
        "## Fixed candidate OOF comparison",
        "",
        "Candidate outer scores are descriptive only; they did not participate in selection.",
        "",
        "| Candidate | RE F1 | RU F1 | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Accuracy |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for cid, score in report["evaluation"]["fixedCandidatesOuterOOFDescriptive"].items():
        pc = score["equalAnimalPerClass"]
        lines.append(f"| {cid} | {pc['RE']['f1']:.3f} | {pc['RU']['f1']:.3f} | {score['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {pc['RE']['recall']:.3f} | {pc['RU']['recall']:.3f} | {score['equalAnimalMacroF1']:.3f} | {score['observationWeightedAccuracy']:.3f} |")
    majority = report["evaluation"]["majorityReference"]
    majority_classes = majority["equalAnimalPerClass"]
    lines.append(f"| training-fold majority (reference) | {majority_classes['RE']['f1']:.3f} | {majority_classes['RU']['f1']:.3f} | {majority['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {majority_classes['RE']['recall']:.3f} | {majority_classes['RU']['recall']:.3f} | {majority['equalAnimalMacroF1']:.3f} | {majority['observationWeightedAccuracy']:.3f} |")
    lines.extend([
        "",
        "## Frozen static baseline on all rows",
        "",
        "This existing result uses all 8,864 audited rows and is provided for context only; it is not an apples-to-apples score against the temporally complete 5,582-row set.",
        "",
        "| Reference | Observation-weighted accuracy | Observation-weighted macro-F1 | Equal-animal accuracy | Equal-animal macro-F1 |",
        "|---|---:|---:|---:|---:|",
    ])
    reference_metrics = report["staticAllRowsReference"]["metrics"]
    static_obs = reference_metrics["frozenStaticLogisticObservationWeighted"]
    static_animal = reference_metrics["frozenStaticLogisticEqualAnimalWeighted"]
    lines.append(f"| MI logistic, 6-fold grouped OOF | {static_obs['accuracy']:.3f} | {static_obs['macroF1']:.3f} | {static_animal['accuracy']:.3f} | {static_animal['macroF1']:.3f} |")
    lines.extend([
        "",
        "## Per-fold selection and outcome",
        "",
        "| Outer fold | Selected candidate | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Test animals |",
        "|---:|---|---:|---:|---:|---:|---|",
    ])
    for fold, result in report["evaluation"]["outerFolds"].items():
        selected = result["selected"]
        test_animals = ", ".join(result["testAnimals"])
        lines.append(f"| {fold} | {result['selectedCandidate']} | {selected['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {selected['equalAnimalMeanRecall_RE_RU']['RE']:.3f} | {selected['equalAnimalMeanRecall_RE_RU']['RU']:.3f} | {selected['equalAnimalMacroF1']:.3f} | {test_animals} |")
    lines.extend([
        "",
        "## Limits",
        "",
        "The outer folds hold out animals but reuse the same two ranches and all breeds, so these numbers do not establish ranch transfer. The source has only one scalar motion index, 24 animals, and repeated minute-level labels; short behaviors may inherit labels from adjacent minutes, so a temporal model can benefit from annotation persistence. The frozen static baseline on all 8,864 rows is reported separately in the JSON and is not directly comparable with this 5,582-row common temporal subset.",
        "",
        "The JSON report includes per-animal scores, actual-by-predicted confusion matrices, complete outer fold assignments, inner rankings, and each fold's selected candidate.",
        "",
        f"Reproduce with `python3 {report['reproducibility']['script']}`. Machine-readable results: `{(HERE / 'results.json').relative_to(ROOT).as_posix()}`; OOF rows: `{report['reproducibility']['predictionFile']}`.",
        "",
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    completed = run()
    print(json.dumps({
        "rows": completed["preprocessing"]["temporalRows"],
        "selectedCandidateCounts": completed["evaluation"]["selectedCandidateCountsAcrossOuterFolds"],
        "primary": completed["evaluation"]["nestedSelectedModel"]["primaryEqualAnimalMeanF1_RE_RU"],
        "report": (HERE / "results.json").relative_to(ROOT).as_posix(),
    }, ensure_ascii=False, indent=2))
