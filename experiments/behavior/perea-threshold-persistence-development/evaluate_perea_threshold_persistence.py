#!/usr/bin/env python3
"""Post-hoc development diagnostics for simple MI behavior rules.

This experiment uses the same 5,582 temporally complete rows and frozen outer
animal folds as the earlier Perea nested evaluation. It is not independent
validation. Both threshold pairs are selected only from inner animal-group
OOF predictions inside each outer training partition.

The two-cut rule uses two causal MI-derived inputs: current motion level and
absolute one-minute change. A single scalar feature with only two ordered
cutpoints has only three intervals and cannot represent four labels. The
quadrant rule below therefore makes its two input thresholds explicit:

    low MI / low change  -> RE     low MI / high change -> RU
    high MI / low change -> GR     high MI / high change -> WA

The persistence variant applies a fixed two-consecutive-suggestion hysteresis
to this rule. It seeds from the rule prediction, propagates only its own prior
prediction within a contiguous animal sequence, and resets at an animal change
or timestamp gap. It never carries forward observed labels.
"""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import platform
import subprocess
from collections import Counter
from datetime import timedelta
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
RESULTS_JSON = HERE / "results.json"
RESULTS_MD = HERE / "results.md"
PREDICTIONS_CSV = HERE / "predictions.csv"
PREREG = ROOT / "experiments/diagnostics/behavior/preregister-perea-nested-animal-evaluation-2026-10.json"
FROZEN_RESULTS = ROOT / "experiments/behavior/perea-nested-animal/results.json"
NESTED_SCRIPT = ROOT / "experiments/behavior/perea-nested-animal/run_perea_nested_evaluation.py"
CLASSES = ("GR", "RE", "RU", "WA")
CLASS_INDEX = {label: i for i, label in enumerate(CLASSES)}
ONE_MINUTE = timedelta(minutes=1)
PERSISTENCE_CONFIRMATIONS = 2
# The sensor's documented range is [0, 30]. Half-unit boundaries cover every
# integer MI value without estimating a cutpoint grid from held-out animals.
THRESHOLD_GRID = tuple(float(v) for v in np.arange(-0.5, 31.0, 1.0))


def _load_nested_module():
    spec = importlib.util.spec_from_file_location("perea_nested_reference", NESTED_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load shared Perea preprocessing from {NESTED_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def threshold_rule(features: np.ndarray, level_cut: float, change_cut: float) -> np.ndarray:
    """Map current MI and absolute 1-minute MI change to four behavior labels."""
    x = np.asarray(features, dtype=float)
    if x.ndim != 2 or x.shape[1] < 2:
        raise ValueError("Expected causal features containing MI_t and MI_t-1")
    low_level = x[:, 0] <= level_cut
    low_change = np.abs(x[:, 0] - x[:, 1]) <= change_cut
    # Low/high movement level selects static/active; within each state, low/high
    # one-minute change distinguishes its two labels.
    pred = np.empty(len(x), dtype=np.int8)
    pred[low_level & low_change] = CLASS_INDEX["RE"]
    pred[low_level & ~low_change] = CLASS_INDEX["RU"]
    pred[~low_level & low_change] = CLASS_INDEX["GR"]
    pred[~low_level & ~low_change] = CLASS_INDEX["WA"]
    return pred


def auto_fed_persistence(rows: list[dict], suggestions: np.ndarray,
                         confirmations: int = PERSISTENCE_CONFIRMATIONS) -> np.ndarray:
    """Apply causal hysteresis to predictions, resetting at animal/time gaps."""
    if confirmations < 1:
        raise ValueError("confirmations must be positive")
    if len(rows) != len(suggestions):
        raise ValueError("rows and suggestions must have equal length")
    output = np.empty(len(rows), dtype=np.int8)
    last_animal = None
    last_time = None
    state = None
    pending = None
    pending_count = 0
    for i, (row, raw_value) in enumerate(zip(rows, suggestions)):
        raw = int(raw_value)
        animal = row["animal"]
        timestamp = row["timestamp"]
        reset = animal != last_animal or last_time is None or timestamp - last_time != ONE_MINUTE
        if reset:
            state = raw
            pending = None
            pending_count = 0
        elif raw == state:
            pending = None
            pending_count = 0
        else:
            if pending == raw:
                pending_count += 1
            else:
                pending = raw
                pending_count = 1
            if pending_count >= confirmations:
                state = raw
                pending = None
                pending_count = 0
        output[i] = state
        last_animal = animal
        last_time = timestamp
    return output


def per_animal_metrics(y: np.ndarray, pred: np.ndarray,
                       animals: np.ndarray) -> dict:
    """Report per-animal scores and equal-animal averages (zero support -> 0)."""
    per_animal = {}
    for animal in sorted(set(animals.tolist())):
        mask = animals == animal
        confusion = np.bincount(
            len(CLASSES) * y[mask] + pred[mask], minlength=len(CLASSES) ** 2
        ).reshape((len(CLASSES), len(CLASSES)))
        support = confusion.sum(axis=1)
        predicted = confusion.sum(axis=0)
        recall = np.divide(np.diag(confusion), support, out=np.zeros(len(CLASSES)), where=support > 0)
        precision = np.divide(np.diag(confusion), predicted, out=np.zeros(len(CLASSES)), where=predicted > 0)
        f1 = np.divide(2 * precision * recall, precision + recall,
                       out=np.zeros(len(CLASSES)), where=(precision + recall) > 0)
        per_animal[animal] = {
            "n": int(mask.sum()),
            "accuracy": float(np.mean(y[mask] == pred[mask])),
            "macroF1": float(np.mean(f1)),
            "perClass": {
                label: {
                    "support": int(support[i]),
                    "precision": float(precision[i]),
                    "recall": float(recall[i]),
                    "f1": float(f1[i]),
                }
                for i, label in enumerate(CLASSES)
            },
            "confusionMatrixActualRowsPredictedColumns": confusion.astype(int).tolist(),
        }
    equal_class = {}
    for i, label in enumerate(CLASSES):
        equal_class[label] = {
            metric: float(np.mean([m["perClass"][label][metric] for m in per_animal.values()]))
            for metric in ("precision", "recall", "f1")
        }
    pooled = np.bincount(len(CLASSES) * y + pred, minlength=len(CLASSES) ** 2).reshape((4, 4))
    recall_pooled = np.divide(np.diag(pooled), pooled.sum(axis=1), out=np.zeros(4), where=pooled.sum(axis=1) > 0)
    precision_pooled = np.divide(np.diag(pooled), pooled.sum(axis=0), out=np.zeros(4), where=pooled.sum(axis=0) > 0)
    f1_pooled = np.divide(2 * recall_pooled * precision_pooled, recall_pooled + precision_pooled,
                          out=np.zeros(4), where=(recall_pooled + precision_pooled) > 0)
    weak_f1 = (equal_class["RE"]["f1"] + equal_class["RU"]["f1"]) / 2
    return {
        "nRows": int(len(y)),
        "nAnimals": len(per_animal),
        "primaryEqualAnimalMeanF1_RE_RU": float(weak_f1),
        "equalAnimalPerClass": equal_class,
        "equalAnimalMacroF1": float(np.mean([m["macroF1"] for m in per_animal.values()])),
        "equalAnimalAccuracy": float(np.mean([m["accuracy"] for m in per_animal.values()])),
        "recordAccuracy": float(np.mean(y == pred)),
        "recordBalancedAccuracy": float(np.mean(recall_pooled)),
        "recordMacroF1": float(np.mean(f1_pooled)),
        "confusionMatrixActualRowsPredictedColumns": pooled.astype(int).tolist(),
        "perAnimal": per_animal,
    }


def _selection_key(score: dict, level_cut: float, change_cut: float) -> tuple:
    classes = score["equalAnimalPerClass"]
    min_weak_recall = min(classes["RE"]["recall"], classes["RU"]["recall"])
    # The fixed lexicographic final tie-break avoids arbitrary search-order ties.
    return (
        score["primaryEqualAnimalMeanF1_RE_RU"],
        min_weak_recall,
        score["equalAnimalMacroF1"],
        -level_cut,
        -change_cut,
    )


def _smooth_rows(rows: list[dict], raw_predictions: np.ndarray) -> np.ndarray:
    return auto_fed_persistence(rows, raw_predictions, PERSISTENCE_CONFIRMATIONS)


def select_thresholds_inner(rows: list[dict], specs: list[dict], outer_fold: dict,
                            threshold_grid: tuple[float, ...] = THRESHOLD_GRID) -> dict:
    """Select raw and persistent-rule thresholds from stitched inner OOF only."""
    outer_test = set(outer_fold["testAnimals"])
    train_positions = [i for i, row in enumerate(rows) if row["animal"] not in outer_test]
    train_animals = [rows[i]["animal"] for i in train_positions]
    inner_fold_map = specs["make_inner_fold_map"](sorted(set(train_animals)))
    inner_fold_ids = np.array([inner_fold_map[rows[i]["animal"]] for i in train_positions])
    if set(inner_fold_ids.tolist()) != set(range(5)):
        raise ValueError("Expected all five frozen inner animal folds")
    if any(sum(inner_fold_ids == fold) == 0 for fold in range(5)):
        raise ValueError("An inner validation fold has no rows")
    inner_rows = [rows[i] for i in train_positions]
    features = np.asarray([row["features"] for row in inner_rows], dtype=float)
    labels = np.asarray([CLASS_INDEX[row["label"]] for row in inner_rows], dtype=np.int8)
    animals = np.asarray([row["animal"] for row in inner_rows], dtype=object)
    for fold in range(5):
        validation_animals = {inner_rows[i]["animal"] for i in np.flatnonzero(inner_fold_ids == fold)}
        training_animals = {inner_rows[i]["animal"] for i in np.flatnonzero(inner_fold_ids != fold)}
        if validation_animals & training_animals or len(validation_animals) != 4 or len(training_animals) != 16:
            raise ValueError("Inner split is not grouped by animal with expected 4/16 groups")

    best_raw = None
    best_persist = None
    for level_cut in threshold_grid:
        for change_cut in threshold_grid:
            raw = threshold_rule(features, level_cut, change_cut)
            score_raw = per_animal_metrics(labels, raw, animals)
            persistent = _smooth_rows(inner_rows, raw)
            score_persistent = per_animal_metrics(labels, persistent, animals)
            candidate = {
                "levelCut": level_cut,
                "changeCut": change_cut,
                "rawScore": score_raw,
                "persistenceScore": score_persistent,
            }
            if best_raw is None or _selection_key(score_raw, level_cut, change_cut) > _selection_key(
                best_raw["rawScore"], best_raw["levelCut"], best_raw["changeCut"]
            ):
                best_raw = candidate
            if best_persist is None or _selection_key(score_persistent, level_cut, change_cut) > _selection_key(
                best_persist["persistenceScore"], best_persist["levelCut"], best_persist["changeCut"]
            ):
                best_persist = candidate
    if best_raw is None or best_persist is None:
        raise ValueError("No threshold candidates were evaluated")
    return {
        "rawThreshold": {"levelCut": best_raw["levelCut"], "changeCut": best_raw["changeCut"]},
        "persistenceThreshold": {"levelCut": best_persist["levelCut"], "changeCut": best_persist["changeCut"]},
        "rawInnerScore": best_raw["rawScore"],
        "persistenceInnerScore": best_persist["persistenceScore"],
        "innerAnimals": sorted(set(train_animals)),
        "innerFolds": {
            str(fold): sorted({inner_rows[i]["animal"] for i in np.flatnonzero(inner_fold_ids == fold)})
            for fold in range(5)
        },
        "thresholdGridSize": len(threshold_grid),
        "thresholdPairsEvaluated": len(threshold_grid) ** 2,
        "selectionMetric": "equal-animal mean of per-animal F1 for RE and RU",
        "tieBreakers": [
            "higher minimum equal-animal RE/RU recall",
            "higher equal-animal four-class macro-F1",
            "lower MI-level cutpoint, then lower absolute-change cutpoint",
        ],
    }


def _outer_majority(rows: list[dict], test_animals: set[str]) -> int:
    counts = Counter(row["label"] for row in rows if row["animal"] not in test_animals)
    return CLASS_INDEX[max(CLASSES, key=lambda label: (counts[label], -CLASS_INDEX[label]))]


def evaluate() -> dict:
    nested = _load_nested_module()
    prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    rows, audit = nested.read_clean_rows(nested.SOURCE_PATH, prereg["source"]["md5"])
    temporal_rows = nested.make_temporal_rows(rows)
    frozen = json.loads(FROZEN_RESULTS.read_text(encoding="utf-8"))
    outer_folds = prereg["outerEvaluation"]["assignmentsFromFrozenExistingEvaluation"]
    if len(temporal_rows) != prereg["preprocessing"]["commonTemporalRowsExpected"]:
        raise ValueError("Temporal row count differs from frozen common-case set")
    if set(row["animal"] for row in temporal_rows) != {
        animal for fold in outer_folds for animal in fold["testAnimals"]
    }:
        raise ValueError("Frozen outer assignments do not cover the temporal animals exactly once")

    output_rows = []
    outer_results = {}
    for fold in outer_folds:
        test_animals = set(fold["testAnimals"])
        train_animals = {row["animal"] for row in temporal_rows} - test_animals
        if train_animals & test_animals or len(train_animals) != 20 or len(test_animals) != 4:
            raise ValueError(f"Outer animal leakage or wrong group counts in fold {fold['fold']}")
        selected = select_thresholds_inner(temporal_rows, {"make_inner_fold_map": nested.make_inner_fold_map}, fold)
        majority = _outer_majority(temporal_rows, test_animals)
        test_rows = [row for row in temporal_rows if row["animal"] in test_animals]
        features = np.asarray([row["features"] for row in test_rows], dtype=float)
        actual = np.asarray([CLASS_INDEX[row["label"]] for row in test_rows], dtype=np.int8)
        animals = np.asarray([row["animal"] for row in test_rows], dtype=object)
        raw_params = selected["rawThreshold"]
        persistence_params = selected["persistenceThreshold"]
        raw_pred = threshold_rule(features, raw_params["levelCut"], raw_params["changeCut"])
        persistence_suggestions = threshold_rule(
            features, persistence_params["levelCut"], persistence_params["changeCut"]
        )
        persistence_pred = _smooth_rows(test_rows, persistence_suggestions)
        majority_pred = np.full(len(test_rows), majority, dtype=np.int8)
        model_scores = {
            "trainingMajority": per_animal_metrics(actual, majority_pred, animals),
            "twoThresholdMI": per_animal_metrics(actual, raw_pred, animals),
            "autoFedPersistence": per_animal_metrics(actual, persistence_pred, animals),
        }
        outer_results[str(fold["fold"])] = {
            "trainAnimalCount": len(train_animals),
            "testAnimals": sorted(test_animals),
            "innerSelection": {
                "rawThreshold": selected["rawThreshold"],
                "persistenceThreshold": selected["persistenceThreshold"],
                "rawInnerPrimary": selected["rawInnerScore"]["primaryEqualAnimalMeanF1_RE_RU"],
                "persistenceInnerPrimary": selected["persistenceInnerScore"]["primaryEqualAnimalMeanF1_RE_RU"],
                "thresholdGridSize": selected["thresholdGridSize"],
                "thresholdPairsEvaluated": selected["thresholdPairsEvaluated"],
                "innerFolds": selected["innerFolds"],
            },
            "models": model_scores,
        }
        for i, row in enumerate(test_rows):
            output_rows.append({
                "animal": row["animal"],
                "breed": row["breed"],
                "timestamp": row["timestamp"].isoformat(timespec="minutes"),
                "MI_t": row["features"][0],
                "MI_t-1": row["features"][1],
                "behavior_observed": row["label"],
                "outer_fold": fold["fold"],
                "threshold_level_cut": raw_params["levelCut"],
                "threshold_change_cut": raw_params["changeCut"],
                "persistence_level_cut": persistence_params["levelCut"],
                "persistence_change_cut": persistence_params["changeCut"],
                "prediction_majority": CLASSES[int(majority_pred[i])],
                "prediction_two_threshold": CLASSES[int(raw_pred[i])],
                "prediction_auto_fed_persistence": CLASSES[int(persistence_pred[i])],
            })

    if len(output_rows) != len(temporal_rows):
        raise ValueError("Outer OOF predictions do not cover all 5,582 common rows")
    output_rows.sort(key=lambda row: (row["animal"], row["timestamp"]))
    y = np.asarray([CLASS_INDEX[row["behavior_observed"]] for row in output_rows], dtype=np.int8)
    animals = np.asarray([row["animal"] for row in output_rows], dtype=object)
    metrics = {}
    for name, field in (
        ("trainingMajority", "prediction_majority"),
        ("twoThresholdMI", "prediction_two_threshold"),
        ("autoFedPersistence", "prediction_auto_fed_persistence"),
    ):
        pred = np.asarray([CLASS_INDEX[row[field]] for row in output_rows], dtype=np.int8)
        metrics[name] = per_animal_metrics(y, pred, animals)
    candidate_counts = Counter()
    for result in outer_results.values():
        candidate_counts[tuple(result["innerSelection"]["rawThreshold"].values())] += 1
    return {
        "kind": "post_hoc_behavior_development_diagnostic_not_independent_validation",
        "status": "exploratory_development_only",
        "source": {
            "doi": prereg["source"]["doi"],
            "license": prereg["source"]["license"],
            "file": prereg["source"]["file"],
            "md5": hashlib.md5(nested.SOURCE_PATH.read_bytes()).hexdigest(),
        },
        "scope": {
            "rows": len(temporal_rows),
            "animals": len({row["animal"] for row in temporal_rows}),
            "outerFoldAssignments": "Frozen from experiments/diagnostics/behavior/preregister-perea-nested-animal-evaluation-2026-10.json; same 5,582 rows as existing nested evaluation.",
            "primaryMetric": "equal-animal mean of per-animal F1 for RE and RU; every animal has equal weight",
            "developmentCaveat": "This rule family and persistence smoother were designed after inspection of the frozen Perea baseline. Nested OOF is development evidence only, not a new independent validation or an external-ranch result.",
            "thresholdInterpretation": "Two fixed-domain cutpoints: current MI level and absolute one-minute MI change. This gives four MI quadrants; a one-feature ordinal rule with only two cutpoints cannot represent four ordered behavior labels.",
        },
        "preprocessing": {
            **audit,
            "temporalRows": len(temporal_rows),
            "temporalRowsOmitted": len(rows) - len(temporal_rows),
            "features": ["MI_t", "MI_t-1"],
            "thresholdDomain": [min(THRESHOLD_GRID), max(THRESHOLD_GRID)],
            "thresholdGrid": list(THRESHOLD_GRID),
            "thresholdsChosenUsing": "Stitched inner OOF predictions from five animal-group folds inside each outer training set; outer labels never enter threshold selection.",
            "innerThresholdPairsPerOuterFoldPerVariant": len(THRESHOLD_GRID) ** 2,
            "persistence": {
                "base": "The two-threshold MI rule, with its own threshold pair selected in inner grouped OOF.",
                "transitionRule": f"Switch from the prior predicted label after {PERSISTENCE_CONFIRMATIONS} consecutive differing instantaneous rule predictions; output prior prediction before confirmation.",
                "seed": "Instantaneous rule prediction at each contiguous animal-window start.",
                "reset": "Animal change or any timestamp difference other than exactly one minute resets to the instantaneous prediction and clears pending state.",
                "usesObservedPastLabels": False,
            },
            "deduplication": "Reuses the frozen same-label collapse/conflict-exclusion policy; no refitting of earlier baseline models.",
        },
        "metrics": metrics,
        "outerFolds": outer_results,
        "selectedRawThresholdCounts": [
            {"levelCut": float(key[0]), "changeCut": float(key[1]), "outerFolds": count}
            for key, count in sorted(candidate_counts.items())
        ],
        "frozenReference": {
            "path": "experiments/behavior/perea-nested-animal/results.json",
            "selectedNestedModelPrimaryF1_RE_RU": frozen["evaluation"]["nestedSelectedModel"]["primaryEqualAnimalMeanF1_RE_RU"],
            "comparisonGuardrail": "The reference nested selection was itself development on this source. It is not an independent benchmark; report alongside this diagnostic only as context.",
        },
        "reproducibility": {
            "command": "uv run --python 3.12 --with-requirements requirements-data-processing.txt -- python experiments/behavior/perea-threshold-persistence-development/evaluate_perea_threshold_persistence.py",
            "script": "experiments/behavior/perea-threshold-persistence-development/evaluate_perea_threshold_persistence.py",
            "predictionFile": "experiments/behavior/perea-threshold-persistence-development/predictions.csv",
            "dependencies": ["Python 3.12", "NumPy from requirements-data-processing.txt"],
            "pythonVersion": platform.python_version(),
            "numpyVersion": np.__version__,
            "deterministic": True,
            "inputChecksums": {"pereaCsvMd5": hashlib.md5(nested.SOURCE_PATH.read_bytes()).hexdigest()},
            "codeRevision": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or None,
            "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
        "limitations": [
            "Only 24 animal groups and two ranches; the outer folds do not establish independent site transfer.",
            "The thresholds and persistence design were made after the frozen baseline was inspected; this nested run is development-only.",
            "One scalar MI compresses axes and head/jaw movement; RE and RU remain difficult to separate.",
            "Minute records are autocorrelated and source annotations carry short behaviors forward; rows are not independent replicates.",
            "These behavior labels do not validate DMI, ADG, intake, BR-CORTE, or the Riose engine.",
        ],
        "predictions": output_rows,
    }


def render_markdown(report: dict) -> str:
    lines = [
        "# Perea threshold and auto-fed persistence development diagnostic",
        "",
        "**Post-hoc development diagnostic only.** The thresholds and persistence rule were designed after inspection of the frozen baseline. These nested OOF scores are not independent validation, are not a new ranch test, and do not validate the Riose engine.",
        "",
        f"Source DOI: `{report['source']['doi']}`; license `{report['source']['license']}`; MD5 `{report['source']['md5']}`.",
        "",
        "## Frozen scope and rule",
        "",
        f"The experiment uses the same {report['scope']['rows']:,} temporally complete rows and frozen six outer animal folds as the earlier nested run. The primary metric is equal-animal mean per-animal F1 for RE and RU. A one-dimensional ordered rule with two cutpoints can represent only three intervals, so this two-cut rule uses two causal MI-derived inputs: current MI level and absolute one-minute change.",
        "",
        "The four quadrants map low level/low change to RE, low level/high change to RU, high level/low change to GR, and high level/high change to WA. Each outer training set selects cutpoints on stitched OOF predictions from five inner animal-group folds. The persistence variant gets its own inner-selected pair, seeds with the instantaneous rule at each animal-window start, and switches after two consecutive differing rule suggestions. It carries only its own prior predictions and resets at timestamp gaps; it never uses observed prior labels.",
        "",
        "## Same-row outer OOF results",
        "",
        "| Model | Primary equal-animal RE/RU F1 | Equal-animal RE recall | Equal-animal RU recall | Equal-animal macro-F1 | Record accuracy |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name, label in (
        ("trainingMajority", "Outer-training majority"),
        ("twoThresholdMI", "Two-threshold MI rule"),
        ("autoFedPersistence", "Auto-fed persistence (2 confirmations)"),
    ):
        score = report["metrics"][name]
        pc = score["equalAnimalPerClass"]
        lines.append(
            f"| {label} | {score['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {pc['RE']['recall']:.3f} | {pc['RU']['recall']:.3f} | {score['equalAnimalMacroF1']:.3f} | {score['recordAccuracy']:.3f} |"
        )
    lines.extend([
        "",
        "### Cutpoints selected per outer fold",
        "",
        "| Fold | Raw rule: MI level | Raw rule: |ΔMI| | Persistence: MI level | Persistence: |ΔMI| |",
        "|---:|---:|---:|---:|---:|",
    ])
    for fold, result in report["outerFolds"].items():
        raw = result["innerSelection"]["rawThreshold"]
        pers = result["innerSelection"]["persistenceThreshold"]
        lines.append(f"| {fold} | {raw['levelCut']:.1f} | {raw['changeCut']:.1f} | {pers['levelCut']:.1f} | {pers['changeCut']:.1f} |")
    lines.extend([
        "",
        "## Limits and interpretation",
        "",
        "The static majority baseline is intentionally simple. The threshold rule tests whether a tiny MI-derived rule can serve as a transparent baseline; the persistence variant tests a causal predicted-state smoother, not the source's gold-label carry-forward. The raw threshold rule has primary RE/RU F1 0.392, close to the earlier selected-model reference 0.403, but record accuracy is only 0.361 versus 0.814 for that reference. This is a pronounced class tradeoff, not a general improvement. The design was created after viewing earlier Perea errors, so the nested outer estimates must not be described as confirmatory or independent. A fresh dataset with compatible video labels and animal identity is still required for external validation.",
        "",
        "The machine-readable JSON includes all per-animal scores, outer-fold results, and selected thresholds; the corresponding OOF predictions are in a separate CSV. Reproduce with:",
        "",
        f"```bash\n{report['reproducibility']['command']}\n```",
        "",
    ])
    return "\n".join(lines)


def write_results(report: dict) -> None:
    HERE.mkdir(parents=True, exist_ok=True)
    prediction_rows = report.pop("predictions")
    fields = [
        "animal", "breed", "timestamp", "MI_t", "MI_t-1", "behavior_observed", "outer_fold",
        "threshold_level_cut", "threshold_change_cut", "persistence_level_cut", "persistence_change_cut",
        "prediction_majority", "prediction_two_threshold", "prediction_auto_fed_persistence",
    ]
    with PREDICTIONS_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(prediction_rows)
    pred_hash = hashlib.sha256(PREDICTIONS_CSV.read_bytes()).hexdigest()
    report["reproducibility"]["predictionsSha256"] = pred_hash
    RESULTS_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RESULTS_MD.write_text(render_markdown(report), encoding="utf-8")


def main() -> None:
    report = evaluate()
    write_results(report)
    print(json.dumps({
        "rows": report["scope"]["rows"],
        "primary": {name: score["primaryEqualAnimalMeanF1_RE_RU"] for name, score in report["metrics"].items()},
        "results": str(RESULTS_JSON.relative_to(ROOT)),
        "predictions": str(PREDICTIONS_CSV.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
