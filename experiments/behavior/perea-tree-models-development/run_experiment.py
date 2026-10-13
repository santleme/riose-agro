#!/usr/bin/env python3
"""Exploratory fixed-family nested animal-group comparison for Perea behavior."""
from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import os
import platform
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PREREG = HERE / "preregistration.json"
BASELINE_DIR = ROOT / "experiments/behavior/perea-nested-animal"
OLD_PREREG = ROOT / "experiments/diagnostics/behavior/preregister-perea-nested-animal-evaluation-2026-10.json"
MOD_PATH = BASELINE_DIR / "run_perea_nested_evaluation.py"
spec = importlib.util.spec_from_file_location("perea_nested_baseline", MOD_PATH)
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)

SEED = 20261013
CLASSES = base.CLASSES
CLASS_INDEX = base.CLASS_INDEX


def candidate_specs() -> list[dict]:
    previous = json.loads(OLD_PREREG.read_text(encoding="utf-8"))["nestedSelection"]["fixedCandidates"]
    return previous + [
        {"id": "random_forest", "features": "MI_t..MI_t-4", "model": "RandomForestClassifier(n_estimators=100,max_depth=6,min_samples_leaf=20,max_features=1.0,n_jobs=1,random_state=20261013)"},
        {"id": "hist_gradient_boosting", "features": "MI_t..MI_t-4", "model": "HistGradientBoostingClassifier(max_iter=100,max_leaf_nodes=7,min_samples_leaf=20,l2_regularization=1.0,early_stopping=False,random_state=20261013)"},
    ]


def fit(specification: dict, x: np.ndarray, y: np.ndarray, groups: np.ndarray) -> tuple[dict, float]:
    cid = specification["id"]
    start = time.process_time()
    if cid in {"random_forest", "hist_gradient_boosting"}:
        weights = base.row_weights(groups, y)
        if cid == "random_forest":
            model = RandomForestClassifier(n_estimators=100, max_depth=6, min_samples_leaf=20,
                                           max_features=1.0, n_jobs=1, random_state=SEED)
        else:
            model = HistGradientBoostingClassifier(max_iter=100, max_leaf_nodes=7, min_samples_leaf=20,
                                                   l2_regularization=1.0, early_stopping=False,
                                                   random_state=SEED)
        model.fit(x, y, sample_weight=weights)
        fitted = {"kind": "sklearn_tree_ensemble", "model": model}
    else:
        fitted = base.fit_candidate(specification, x, y, groups)
    return fitted, time.process_time() - start


def predict(fitted: dict, specification: dict, x: np.ndarray) -> tuple[np.ndarray, float]:
    start = time.process_time()
    if fitted["kind"] == "sklearn_tree_ensemble":
        result = fitted["model"].predict(x).astype(int)
    else:
        result = base.predict_candidate(fitted, specification, x)
    return result, time.process_time() - start


def complexity(spec: dict) -> tuple[int, float]:
    cid = spec["id"]
    if cid == "static_logistic":
        return 0, 0
    if cid.startswith("temporal_logistic_c_"):
        return 1, float(cid.removeprefix("temporal_logistic_c_").replace("_", "."))
    if cid.startswith("cart_depth_"):
        return 2, float(cid.rsplit("_", 1)[1])
    return (3 if cid == "random_forest" else 4), 0


def scores(y: np.ndarray, pred: np.ndarray, groups: np.ndarray) -> dict:
    result = base.scores_from_predictions(y, pred, groups)
    result["balancedAccuracy"] = float(np.mean([result["equalAnimalPerClass"][label]["recall"] for label in CLASSES]))
    for metric in result["perAnimal"].values():
        metric["balancedAccuracy"] = float(np.mean([metric["perClass"][label]["recall"] for label in CLASSES]))
    return result


def indices_for_animals(index_by_animal: dict[str, list[int]], animals) -> np.ndarray:
    """Construct row indices in stable animal order, independent of set iteration."""
    return np.array([i for animal in sorted(animals) for i in index_by_animal[animal]], dtype=int)


def select(scores: dict[str, dict], specs: list[dict]) -> tuple[str, list[dict]]:
    by_id = {s["id"]: s for s in specs}
    ranked = [{"candidate": cid, "primary": score["primaryEqualAnimalMeanF1_RE_RU"],
               "minimumWeakClassRecall": score["tieBreakMinimumWeakClassRecall"],
               "equalAnimalMacroF1": score["equalAnimalMacroF1"], "complexityRank": complexity(by_id[cid])}
              for cid, score in scores.items()]
    ranked.sort(key=lambda r: (-r["primary"], -r["minimumWeakClassRecall"], -r["equalAnimalMacroF1"], r["complexityRank"]))
    return ranked[0]["candidate"], ranked


def nested_oof(rows: list[dict], folds: list[dict], specs: list[dict]) -> tuple[dict, dict, dict]:
    index_by_animal: dict[str, list[int]] = defaultdict(list)
    for i, row in enumerate(rows):
        index_by_animal[row["animal"]].append(i)
    selected_predictions = np.full(len(rows), -1, dtype=int)
    fixed_predictions = {s["id"]: np.full(len(rows), -1, dtype=int) for s in specs}
    selected_by_fold, fit_times, infer_times, inference_animal, selection_counts = {}, defaultdict(list), defaultdict(list), defaultdict(dict), Counter()
    outer_membership = {}
    for fold in folds:
        test_animals = set(fold["testAnimals"])
        train_animals = sorted(set(index_by_animal) - test_animals)
        if len(test_animals) != 4 or len(train_animals) != 20 or test_animals & set(train_animals):
            raise AssertionError("outer animal grouping invariant failed")
        for a in test_animals:
            if a in outer_membership:
                raise AssertionError(f"animal {a} is assigned to multiple outer folds")
            outer_membership[a] = fold["fold"]
        train_i = indices_for_animals(index_by_animal, train_animals)
        test_i = indices_for_animals(index_by_animal, test_animals)
        inner_map = base.make_inner_fold_map(train_animals)
        inner_preds = {s["id"]: np.full(len(rows), -1, dtype=int) for s in specs}
        for inner in range(5):
            valid_animals = {a for a, f in inner_map.items() if f == inner}
            train_inner_animals = set(train_animals) - valid_animals
            if len(valid_animals) != 4 or len(train_inner_animals) != 16 or valid_animals & train_inner_animals:
                raise AssertionError("inner animal grouping invariant failed")
            ii_train = indices_for_animals(index_by_animal, train_inner_animals)
            ii_valid = indices_for_animals(index_by_animal, valid_animals)
            x, y = np.array([rows[i]["features"] for i in ii_train]), np.array([CLASS_INDEX[rows[i]["label"]] for i in ii_train])
            g = np.array([rows[i]["animal"] for i in ii_train], dtype=object)
            xv = np.array([rows[i]["features"] for i in ii_valid])
            for candidate in specs:
                fitted, elapsed = fit(candidate, x, y, g)
                fit_times[candidate["id"]].append(elapsed)
                pred, _ = predict(fitted, candidate, xv)
                inner_preds[candidate["id"]][ii_valid] = pred
        if any(np.any(inner_preds[s["id"]][train_i] < 0) for s in specs):
            raise AssertionError("incomplete inner OOF coverage")
        inner_scores = {}
        for candidate in specs:
            cid = candidate["id"]
            inner_scores[cid] = scores(
                np.array([CLASS_INDEX[rows[i]["label"]] for i in train_i]), inner_preds[cid][train_i],
                np.array([rows[i]["animal"] for i in train_i], dtype=object))
        chosen, ranking = select(inner_scores, specs)
        selection_counts[chosen] += 1
        x, y = np.array([rows[i]["features"] for i in train_i]), np.array([CLASS_INDEX[rows[i]["label"]] for i in train_i])
        g = np.array([rows[i]["animal"] for i in train_i], dtype=object)
        xt = np.array([rows[i]["features"] for i in test_i])
        fold_preds = {}
        for candidate in specs:
            cid = candidate["id"]
            fitted, elapsed = fit(candidate, x, y, g)
            fit_times[cid].append(elapsed)
            pred = np.full(len(test_i), -1, dtype=int)
            test_animals_sorted = sorted(test_animals)
            for animal in test_animals_sorted:
                local = np.array([j for j, row_index in enumerate(test_i) if rows[row_index]["animal"] == animal], dtype=int)
                animal_pred, elapsed_pred = predict(fitted, candidate, xt[local])
                pred[local] = animal_pred
                inference_animal[cid][animal] = elapsed_pred
            infer_times[cid].append(sum(inference_animal[cid][a] for a in test_animals_sorted))
            fixed_predictions[cid][test_i] = pred
            fold_preds[cid] = pred
        selected_predictions[test_i] = fold_preds[chosen]
        y_test = np.array([CLASS_INDEX[rows[i]["label"]] for i in test_i])
        selected_by_fold[str(fold["fold"])] = {
            "selectedCandidate": chosen, "testAnimals": sorted(test_animals), "trainAnimals": train_animals,
            "animalOverlap": [], "innerRanking": ranking,
            "selectedMetrics": scores(y_test, fold_preds[chosen], np.array([rows[i]["animal"] for i in test_i], dtype=object)),
            "candidateMetrics": {s["id"]: scores(y_test, fold_preds[s["id"]], np.array([rows[i]["animal"] for i in test_i], dtype=object)) for s in specs},
        }
    if set(outer_membership) != set(index_by_animal) or np.any(selected_predictions < 0) or any(np.any(p < 0) for p in fixed_predictions.values()):
        raise AssertionError("outer OOF coverage invariant failed")
    y = np.array([CLASS_INDEX[r["label"]] for r in rows])
    groups = np.array([r["animal"] for r in rows], dtype=object)
    overall = {"nestedSelected": scores(y, selected_predictions, groups),
               "fixedCandidates": {cid: scores(y, pred, groups) for cid, pred in fixed_predictions.items()},
               "selectedCandidateCounts": dict(sorted(selection_counts.items())), "outerFolds": selected_by_fold}
    predictions = {"selected": selected_predictions, **fixed_predictions}
    timings = {cid: {"outerRefitCpuSecondsPerFold": [round(v, 8) for v in fit_times[cid][-6:]],
                     "outerRefitCpuSecondsMean": float(np.mean(fit_times[cid][-6:])),
                     "outerPredictionCpuSecondsPerFold": [round(v, 8) for v in infer_times[cid]],
                     "outerPredictionCpuSecondsMean": float(np.mean(infer_times[cid])),
                     "perAnimalHeldOutPredictionCpuSeconds": {a: float(t) for a, t in sorted(inference_animal[cid].items())}}
               for cid in fixed_predictions}
    return overall, predictions, {"timings": timings, "outerMembership": outer_membership}


def bootstrap_difference(per_a: dict, per_b: dict, seed: int = SEED, replicates: int = 10000) -> dict:
    animals = sorted(per_a)
    if animals != sorted(per_b) or len(animals) != 24:
        raise ValueError("paired group bootstrap requires exactly the same 24 animal groups")
    def contribution(row: dict) -> float:
        return (row["perClass"]["RE"]["f1"] + row["perClass"]["RU"]["f1"]) / 2
    diffs = np.array([contribution(per_a[a]) - contribution(per_b[a]) for a in animals])
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, len(animals), size=(replicates, len(animals)))
    bootstrap = diffs[draws].mean(axis=1)
    return {"pairedDifference": float(diffs.mean()), "percentile95": [float(np.quantile(bootstrap, .025)), float(np.quantile(bootstrap, .975))],
            "seed": seed, "replicates": replicates, "resampledUnit": "animal (24 groups, intact; paired candidate values)",
            "animalDifferences": {a: float(d) for a, d in zip(animals, diffs)}}


def breed_diagnostics(rows: list[dict], y: np.ndarray, preds: np.ndarray) -> dict:
    result = {}
    for breed in sorted({r["breed"] for r in rows}):
        ix = [i for i, r in enumerate(rows) if r["breed"] == breed]
        result[breed] = scores(y[ix], preds[ix], np.array([rows[i]["animal"] for i in ix], dtype=object))
    return result


def render(report: dict) -> str:
    evaluation = report["evaluation"]
    prior = evaluation["priorFrozenNestedBaseline"]
    expanded = evaluation["expandedNestedSelection"]
    diff = evaluation["pairedBootstrapExpandedMinusPrior"]
    lines = ["# Perea tree-model development comparison", "",
             "Exploratory post-baseline development on the Perea within-source animal-group folds. Candidate families were chosen after previous Perea results had been inspected. These results are neither confirmatory nor independent validation, and do not establish ranch transfer, DMI, ADG, or engine validity.", "",
             f"Source: [Figshare Perea dataset](https://doi.org/{report['source']['doi']}) ({report['source']['license']}); CSV MD5 `{report['source']['md5']}`. Protocol: `preregistration.json` (written before fitting).", "",
             "## Paired nested comparison", "", "| Procedure | Equal-animal mean F1, RE/RU | RE recall | RU recall | 4-class macro-F1 | Balanced accuracy | Accuracy |", "|---|---:|---:|---:|---:|---:|---:|",
             f"| Prior frozen nested selection | {prior['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {prior['equalAnimalMeanRecall_RE_RU']['RE']:.3f} | {prior['equalAnimalMeanRecall_RE_RU']['RU']:.3f} | {prior['equalAnimalMacroF1']:.3f} | {prior['balancedAccuracy']:.3f} | {prior['observationWeightedAccuracy']:.3f} |",
             f"| Expanded fixed-family nested selection | {expanded['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {expanded['equalAnimalMeanRecall_RE_RU']['RE']:.3f} | {expanded['equalAnimalMeanRecall_RE_RU']['RU']:.3f} | {expanded['equalAnimalMacroF1']:.3f} | {expanded['balancedAccuracy']:.3f} | {expanded['observationWeightedAccuracy']:.3f} |", "",
             f"Expanded-minus-prior primary difference: {diff['pairedDifference']:+.3f}; 95% paired animal-bootstrap percentile interval [{diff['percentile95'][0]:+.3f}, {diff['percentile95'][1]:+.3f}] from {diff['replicates']:,} resamples of 24 animals. This is a descriptive within-cohort sensitivity interval, not prediction uncertainty or calibration.", "",
             "## Fixed candidate outer OOF diagnostics", "", "| Candidate | RE F1 | RU F1 | Primary RE/RU F1 | RE recall | RU recall | Macro-F1 | Balanced accuracy | Accuracy |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for cid, m in evaluation["fixedCandidateOuterOOFDescriptive"].items():
        lines.append(f"| {cid} | {m['equalAnimalPerClass']['RE']['f1']:.3f} | {m['equalAnimalPerClass']['RU']['f1']:.3f} | {m['primaryEqualAnimalMeanF1_RE_RU']:.3f} | {m['equalAnimalMeanRecall_RE_RU']['RE']:.3f} | {m['equalAnimalMeanRecall_RE_RU']['RU']:.3f} | {m['equalAnimalMacroF1']:.3f} | {m['balancedAccuracy']:.3f} | {m['observationWeightedAccuracy']:.3f} |")
    lines += ["", "No candidate-level outer score was used for tuning; inner animal-group OOF predictions selected the model separately in each outer fold. Per-animal, per-fold, per-breed, and confusion-matrix details are in `results.json`.", "",
              "## Limits and interpretation", "",
              "The expanded nested result advances only if it exceeds the already inspected prior result and the paired group-bootstrap lower percentile is above zero. If that gate fails, retain the prior result as the better development reference; no ML improvement is established. The outer folds reuse all sampled breeds and the same two ranches. Ranch is confounded with breed and absent from the model CSV, so ranch-specific effects and ranch transport cannot be separated. Labels are repeated minute annotations, and temporal history may benefit from label persistence.", "",
              "CPU time is measured with `process_time` during fitting and held-out prediction; values characterize this small tabular experiment only.", ""]
    return "\n".join(lines)


def run() -> dict:
    prereg = json.loads(PREREG.read_text(encoding="utf-8"))
    rows_clean, audit = base.read_clean_rows(ROOT / prereg["source"]["file"], prereg["source"]["md5"])
    rows = base.make_temporal_rows(rows_clean)
    if len(rows) != prereg["source"]["analysisRows"]:
        raise ValueError(f"expected {prereg['source']['analysisRows']} rows; got {len(rows)}")
    old = json.loads(OLD_PREREG.read_text(encoding="utf-8"))
    folds = old["outerEvaluation"]["assignmentsFromFrozenExistingEvaluation"]
    specs = candidate_specs()
    current, predictions, diagnostics = nested_oof(rows, folds, specs)
    prior_raw = json.loads((BASELINE_DIR / "results.json").read_text(encoding="utf-8"))
    prior_predictions_path = BASELINE_DIR / "predictions.csv"
    prior_predictions = {}
    with prior_predictions_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            prior_predictions[(row["animal"], row["timestamp"])] = CLASS_INDEX[row["selected_prediction"]]
    keys = [(r["animal"], r["timestamp"].isoformat(timespec="minutes")) for r in rows]
    if len(keys) != len(prior_predictions) or any(k not in prior_predictions for k in keys):
        raise ValueError("frozen prior predictions do not align to the same 5,582 rows")
    prior_pred = np.array([prior_predictions[k] for k in keys], dtype=int)
    y = np.array([CLASS_INDEX[r["label"]] for r in rows])
    groups = np.array([r["animal"] for r in rows], dtype=object)
    prior_metrics = scores(y, prior_pred, groups)
    # Integrity check: reconstructing the frozen CSV predictions reproduces its prior published score.
    frozen_score = prior_raw["evaluation"]["nestedSelectedModel"]["primaryEqualAnimalMeanF1_RE_RU"]
    if not np.isclose(prior_metrics["primaryEqualAnimalMeanF1_RE_RU"], frozen_score, atol=1e-12):
        raise ValueError("prior frozen score does not reproduce from its prediction CSV")
    paired = bootstrap_difference(current["nestedSelected"]["perAnimal"], prior_metrics["perAnimal"])
    threshold = paired["percentile95"][0] > 0 and paired["pairedDifference"] > 0
    candidates = current["fixedCandidates"]
    chosen_pred = predictions["selected"]
    report = {
        "kind": "exploratory_perea_fixed_family_nested_animal_development",
        "preregistration": prereg,
        "source": {"doi": prereg["source"]["doi"], "license": prereg["source"]["license"], "file": prereg["source"]["file"],
                   "md5": hashlib.md5((ROOT / prereg["source"]["file"]).read_bytes()).hexdigest()},
        "preprocessing": {"audit": audit, "commonTemporalRows": len(rows), "features": base.FEATURE_NAMES},
        "evaluation": {"priorFrozenNestedBaseline": prior_metrics, "expandedNestedSelection": current["nestedSelected"],
                       "fixedCandidateOuterOOFDescriptive": candidates,
                       "pairedBootstrapExpandedMinusPrior": paired,
                       "advancementGatePassed": bool(threshold),
                       "interpretation": "Exploratory candidate development only; no improvement established." if not threshold else "Exploratory within-cohort improvement signal only; not independent validation.",
                       "expandedSelectedCandidateCounts": current["selectedCandidateCounts"], "outerFolds": current["outerFolds"]},
        "diagnostics": {"breedForExpandedNestedSelection": breed_diagnostics(rows, y, chosen_pred),
                        "ranch": {"status": "not_separately_estimable", "reason": "The input CSV has no ranch identifier and the two ranches are confounded with breed; no ranch contrast or transport claim is made."},
                        "cpuTiming": diagnostics["timings"],
                        "inferenceCpuSecondsPerAnimal": {}}
    }
    report["diagnostics"]["inferenceCpuSecondsPerAnimal"] = {
        cid: timing["perAnimalHeldOutPredictionCpuSeconds"] for cid, timing in diagnostics["timings"].items()
    }
    # Include per-animal expanded-vs-prior comparisons, breed, fold, and exact row predictions.
    HERE.mkdir(parents=True, exist_ok=True)
    prediction_file = HERE / "predictions.csv"
    with prediction_file.open("w", newline="", encoding="utf-8") as handle:
        fields = ["animal", "breed", "timestamp", "observed", "outer_fold", "selected_candidate", "prior_selected_prediction", "expanded_selected_prediction"] + [f"pred_{s['id']}" for s in specs]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for i, row in enumerate(rows):
            writer.writerow({"animal": row["animal"], "breed": row["breed"], "timestamp": row["timestamp"].isoformat(timespec="minutes"),
                             "observed": row["label"], "outer_fold": diagnostics["outerMembership"][row["animal"]],
                             "selected_candidate": next(v["selectedCandidate"] for v in current["outerFolds"].values() if row["animal"] in v["testAnimals"]),
                             "prior_selected_prediction": CLASSES[prior_pred[i]], "expanded_selected_prediction": CLASSES[chosen_pred[i]],
                             **{f"pred_{cid}": CLASSES[pred[i]] for cid, pred in predictions.items() if cid != "selected"}})
    report["reproducibility"] = {"script": "run_experiment.py", "preregistration": "preregistration.json", "predictionFile": "predictions.csv",
                                 "pythonVersion": platform.python_version(), "numpyVersion": np.__version__, "scikitLearnVersion": sklearn.__version__,
                                 "seed": SEED, "predictionSha256": hashlib.sha256(prediction_file.read_bytes()).hexdigest(),
                                 "deterministic": True, "command": "python3 experiments/behavior/perea-tree-models-development/run_experiment.py"}
    deterministic_payload = {"evaluation": report["evaluation"], "source": report["source"], "preprocessing": report["preprocessing"]}
    report["reproducibility"]["evaluationSha256"] = hashlib.sha256(
        json.dumps(deterministic_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    (HERE / "results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "results.md").write_text(render(report), encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps({"status": "complete", "advancementGatePassed": run()["evaluation"]["advancementGatePassed"]}, indent=2))
