#!/usr/bin/env python3
"""Evaluate fixed collar-to-RumiWatch agreement on Precision Beef source splits."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import re
import time
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
PREREG_PATH = HERE / "preregistration.json"
MANIFEST_PATH = ROOT / "data/precision-beef/manifest.json"
FEATURES = (
    "x_mean_mg", "x_std_population_mg", "x_min_mg", "x_max_mg",
    "y_mean_mg", "y_std_population_mg", "y_min_mg", "y_max_mg",
    "z_mean_mg", "z_std_population_mg", "z_min_mg", "z_max_mg",
)
LABELS = (0, 1, 2)
LABEL_NAMES = {0: "other", 1: "rumination", 2: "eating_or_drinking"}
TEST_ANIMALS = {4, 10, 11}
TRIAL_BY_ANIMAL = {
    **{animal: 1 for animal in range(1, 7)},
    **{animal: 2 for animal in range(7, 11)},
    **{animal: 3 for animal in range(11, 19)},
}
EXPECTED_ANIMALS = set(range(1, 19))
SPLIT_BY_ANIMAL = {animal: ("source_test" if animal in TEST_ANIMALS else "source_train") for animal in EXPECTED_ANIMALS}
REQUIRED_COLUMNS = {
    "timestamp_second", "animal_id", "farm_trial_id", "source_split",
    "n_exact_aligned_10hz_samples", "n_complete_sensor_label_samples",
    "is_complete_10hz_second", "reference_majority_class", *FEATURES,
}
SEED = 20261013
RF_PARAMETERS = {
    "n_estimators": 200, "max_depth": 12, "min_samples_leaf": 10, "max_features": "sqrt",
    "class_weight": "balanced_subsample", "n_jobs": 1, "random_state": SEED,
}


def load_preregistration(path: Path = PREREG_PATH) -> dict:
    prereg = json.loads(path.read_text(encoding="utf-8"))
    if prereg.get("status") != "registered_before_model_fit":
        raise ValueError("Precision Beef protocol must be preregistered before model fitting")
    if tuple(prereg["analysisCohort"]["features"]) != FEATURES:
        raise ValueError("The registered feature list differs from this implementation")
    if prereg["source"]["doi"] != "10.5281/zenodo.4064802":
        raise ValueError("Unexpected source DOI in preregistration")
    if "animals 04, 10, and 11 as test animals" not in prereg["source"]["sourceSplit"]:
        raise ValueError("The preregistered source split differs from animals 04, 10, and 11")
    model_ids = [item.get("id") for item in prereg.get("models", [])]
    if model_ids != ["training_majority_baseline", "random_forest_fixed"]:
        raise ValueError("The registered fixed model set differs from this implementation")
    registered_rf = prereg["models"][1].get("model", "")
    if parse_estimator_parameters(registered_rf) != RF_PARAMETERS:
        raise ValueError("Random Forest settings differ from the registered model")
    return prereg


def parse_estimator_parameters(description: str) -> dict:
    """Parse the preregistered sklearn constructor text into typed fields."""
    match = re.fullmatch(r"RandomForestClassifier\((.*)\)\.?", description.strip())
    if not match:
        raise ValueError("Registered Random Forest description has an unexpected form")
    parsed = {}
    for token in match.group(1).split(","):
        item = re.fullmatch(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*", token)
        if not item:
            raise ValueError(f"Cannot parse registered Random Forest parameter: {token!r}")
        name, raw = item.groups()
        if raw.startswith("'") and raw.endswith("'"):
            value = raw[1:-1]
        elif re.fullmatch(r"-?\d+", raw):
            value = int(raw)
        elif raw in {"True", "False"}:
            value = raw == "True"
        else:
            raise ValueError(f"Unsupported registered parameter value: {raw!r}")
        if name in parsed:
            raise ValueError(f"Duplicate registered Random Forest parameter: {name}")
        parsed[name] = value
    return parsed


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest(manifest: dict, root: Path = ROOT) -> list[tuple[int, Path, dict]]:
    """Require all 18 processed outputs and their recorded digests/split metadata."""
    source = manifest.get("source", {})
    use = manifest.get("use", {})
    if source.get("doi") != "10.5281/zenodo.4064802" or source.get("license") != "CC BY 4.0":
        raise ValueError("Manifest does not verify the registered Zenodo source and CC BY 4.0 license")
    if use.get("commercialTrainingLicenseCompatible") is not True:
        raise ValueError("Manifest does not mark reuse compatible with the registered intended use")
    files = {item.get("name"): item for item in manifest.get("files", [])}
    expected_raw = {"Readme.md"} | {f"accel-{i:02d}.csv" for i in EXPECTED_ANIMALS} | {f"halter-{i:02d}.csv" for i in EXPECTED_ANIMALS}
    if set(files) != expected_raw or any(not item.get("verifiedSha256") for item in files.values()):
        raise ValueError("Raw download manifest is incomplete or lacks verified source checksums")
    entries = manifest.get("processedOutputs", [])
    by_animal: dict[int, dict] = {}
    for entry in entries:
        path = Path(entry.get("path", ""))
        name = path.name
        try:
            animal = int(name.removeprefix("animal-").removesuffix(".parquet"))
        except ValueError as error:
            raise ValueError(f"Unexpected processed filename in manifest: {name!r}") from error
        if name != f"animal-{animal:02d}.parquet" or animal not in EXPECTED_ANIMALS or animal in by_animal:
            raise ValueError(f"Invalid or duplicate processed output for animal {animal}")
        if entry.get("format") != "parquet" or not entry.get("sha256") or not isinstance(entry.get("rows"), int):
            raise ValueError(f"Processed manifest entry is incomplete for animal {animal:02d}")
        if path.is_absolute():
            raise ValueError("Processed output paths must be repository-relative")
        full_path = (root / path).resolve()
        if root.resolve() not in full_path.parents:
            raise ValueError("Processed output path escapes repository root")
        if not full_path.is_file():
            raise FileNotFoundError(f"Processed Parquet is missing: {full_path}")
        if sha256_file(full_path) != entry["sha256"]:
            raise ValueError(f"Processed Parquet checksum mismatch for animal {animal:02d}")
        by_animal[animal] = entry
    if set(by_animal) != EXPECTED_ANIMALS:
        raise ValueError("Manifest must contain exactly one processed Parquet for each of animals 01–18")
    return [(animal, (root / by_animal[animal]["path"]).resolve(), by_animal[animal]) for animal in sorted(by_animal)]


def load_processed_parquets(manifest_path: Path = MANIFEST_PATH, root: Path = ROOT) -> tuple[pd.DataFrame, dict]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    outputs = validate_manifest(manifest, root)
    frames = []
    for animal, path, entry in outputs:
        frame = pd.read_parquet(path)
        validate_animal_frame(frame, animal, expected_rows=entry["rows"], context=path.name)
        frames.append(frame)
    combined = pd.concat(frames, ignore_index=True)
    if combined.duplicated(["animal_id", "timestamp_second"]).any():
        raise ValueError("Duplicate animal-second records are not allowed")
    return combined, {"doi": manifest["source"]["doi"], "license": manifest["source"]["license"],
                      "processedParquets": len(outputs), "processedOutputSha256": {str(animal): entry["sha256"] for animal, _, entry in outputs}}


def validate_animal_frame(frame: pd.DataFrame, animal: int, expected_rows: int | None = None, context: str = "fixture") -> None:
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"{context} lacks required columns: {sorted(missing)}")
    if expected_rows is not None and len(frame) != expected_rows:
        raise ValueError(f"Manifest row count mismatch for {context}")
    if frame.empty:
        return
    if set(frame["animal_id"].dropna().astype(int)) != {animal}:
        raise ValueError(f"Rows in {context} do not match manifest animal id")
    expected_split = SPLIT_BY_ANIMAL[animal]
    expected_trial = TRIAL_BY_ANIMAL[animal]
    if frame["source_split"].isna().any() or set(frame["source_split"]) != {expected_split}:
        raise ValueError(f"Rows in {context} violate the frozen source split")
    if frame["farm_trial_id"].isna().any() or set(frame["farm_trial_id"].astype(int)) != {expected_trial}:
        raise ValueError(f"Rows in {context} violate source trial mapping")
    if frame.duplicated(["animal_id", "timestamp_second"]).any():
        raise ValueError(f"Duplicate animal-second records in {context}")


def eligible_seconds(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Apply only frozen completeness, finite-feature, and unique-label rules."""
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Input rows lack required columns: {sorted(missing)}")
    if frame.empty:
        raise ValueError("No processed second rows supplied")
    if frame.duplicated(["animal_id", "timestamp_second"]).any():
        raise ValueError("Duplicate animal-second records are not allowed")
    data = frame.copy().reset_index(drop=True)
    data["animal_id"] = data["animal_id"].astype(int)
    if not set(data["animal_id"]).issubset(EXPECTED_ANIMALS):
        raise ValueError("Unexpected animal ID in processed rows")
    for animal, group in data.groupby("animal_id"):
        if group["source_split"].isna().any() or group["source_split"].nunique(dropna=False) != 1 or group["source_split"].iloc[0] != SPLIT_BY_ANIMAL[int(animal)]:
            raise ValueError(f"Animal {animal:02d} crosses or violates the frozen source split")
        if group["farm_trial_id"].isna().any() or group["farm_trial_id"].nunique(dropna=False) != 1 or int(group["farm_trial_id"].iloc[0]) != TRIAL_BY_ANIMAL[int(animal)]:
            raise ValueError(f"Animal {animal:02d} violates frozen source trial mapping")
    complete = (
        data["is_complete_10hz_second"].eq(True).fillna(False)
        & (pd.to_numeric(data["n_exact_aligned_10hz_samples"], errors="coerce") == 10)
        & (pd.to_numeric(data["n_complete_sensor_label_samples"], errors="coerce") == 10)
    )
    x = data.loc[:, FEATURES].apply(pd.to_numeric, errors="coerce")
    finite_features = np.isfinite(x.to_numpy(dtype=float)).all(axis=1)
    y = pd.to_numeric(data["reference_majority_class"], errors="coerce")
    valid_label = y.isin(LABELS).to_numpy()
    tie = complete.to_numpy() & y.isna().to_numpy()
    eligible_mask = complete.to_numpy() & finite_features & valid_label
    data.loc[:, FEATURES] = x
    data["reference_majority_class"] = y
    kept = data.loc[eligible_mask].copy().reset_index(drop=True)
    kept["reference_majority_class"] = kept["reference_majority_class"].astype(int)
    by_animal = {}
    for animal, positions in data.groupby("animal_id").indices.items():
        pos = np.asarray(positions, dtype=int)
        row_indices = pos
        cmask = complete.iloc[row_indices].to_numpy()
        tie_mask = tie[row_indices]
        eligible_local = eligible_mask[row_indices]
        feature_missing = cmask & ~finite_features[row_indices]
        by_animal[f"{int(animal):02d}"] = {
            "sourceSplit": SPLIT_BY_ANIMAL[int(animal)],
            "aggregatedSeconds": int(len(pos)),
            "completeSeconds": int(cmask.sum()),
            "tiedReferenceLabelSeconds": int(tie_mask.sum()),
            "missingFeatureCompleteSeconds": int(feature_missing.sum()),
            "eligibleSeconds": int(eligible_local.sum()),
            "tiedFractionOfCompleteSeconds": float(tie_mask.sum() / cmask.sum()) if cmask.sum() else None,
        }
    counts = {
        "aggregatedSeconds": int(len(data)),
        "completeSeconds": int(complete.sum()),
        "tiedReferenceLabelSeconds": int(tie.sum()),
        "missingFeatureCompleteSeconds": int((complete.to_numpy() & ~finite_features).sum()),
        "eligibleSeconds": int(eligible_mask.sum()),
        "tiedFractionOfCompleteSeconds": float(tie.sum() / complete.sum()) if complete.sum() else None,
        "tiedFractionOfAllSeconds": float(tie.sum() / len(data)),
        "byAnimal": by_animal,
    }
    return kept, counts


def equal_animal_weights(frame: pd.DataFrame) -> np.ndarray:
    counts = frame.groupby("animal_id")["animal_id"].transform("size").to_numpy(dtype=float)
    if len(counts) == 0 or np.any(counts <= 0):
        raise ValueError("Training rows must include at least one eligible second")
    weights = 1.0 / counts
    return weights


def training_majority(frame: pd.DataFrame) -> int:
    _assert_train_only(frame)
    labels = frame["reference_majority_class"].to_numpy(dtype=int)
    weights = equal_animal_weights(frame)
    mass = np.array([math.fsum(weights[labels == label].tolist()) for label in LABELS], dtype=float)
    return choose_weighted_class(mass)


def choose_weighted_class(mass: Iterable[float]) -> int:
    mass = np.asarray(list(mass), dtype=float)
    if mass.shape != (len(LABELS),) or not np.isfinite(mass).all() or np.any(mass < 0):
        raise ValueError("Weighted class mass must contain three finite nonnegative values")
    maximum = float(mass.max())
    # Equal-animal mass is assembled from reciprocal counts; absorb floating-point
    # summation noise only at a scale far below any practical class-mass difference.
    tied = np.flatnonzero(np.abs(mass - maximum) <= 1e-12)
    return int(tied[0])


def _assert_train_only(frame: pd.DataFrame) -> None:
    if frame.empty:
        raise ValueError("Cannot fit or derive a training rule from no rows")
    if frame["animal_id"].isna().any():
        raise ValueError("Training rows require animal IDs for group isolation")
    animals = set(frame["animal_id"].astype(int))
    if animals & TEST_ANIMALS:
        raise ValueError("Source-test animals may not enter model fitting or development")
    if frame["source_split"].isna().any() or set(frame["source_split"]) != {"source_train"}:
        raise ValueError("Fitting/development received rows outside source_train")


def fit_random_forest(frame: pd.DataFrame) -> tuple[RandomForestClassifier, float]:
    _assert_train_only(frame)
    x = frame.loc[:, FEATURES].to_numpy(dtype=float)
    y = frame["reference_majority_class"].to_numpy(dtype=int)
    weights = equal_animal_weights(frame)
    model = RandomForestClassifier(**RF_PARAMETERS)
    start = time.process_time()
    model.fit(x, y, sample_weight=weights)
    return model, time.process_time() - start


def predict_training_majority(class_code: int, row_count: int) -> tuple[np.ndarray, float]:
    if class_code not in LABELS or row_count <= 0:
        raise ValueError("Baseline prediction needs a fixed class and nonempty cohort")
    start = time.process_time()
    predictions = np.full(row_count, class_code, dtype=int)
    return predictions, time.process_time() - start


def classification_metrics(y_true: Iterable[int], y_pred: Iterable[int]) -> dict:
    actual = np.asarray(list(y_true), dtype=int)
    predicted = np.asarray(list(y_pred), dtype=int)
    if len(actual) == 0 or len(actual) != len(predicted):
        raise ValueError("Metrics require equal, nonempty target and prediction arrays")
    if not set(actual).issubset(LABELS) or not set(predicted).issubset(LABELS):
        raise ValueError("Metrics accept only the preregistered class codes 0, 1, and 2")
    matrix = np.zeros((len(LABELS), len(LABELS)), dtype=int)
    for a, p in zip(actual, predicted):
        matrix[a, p] += 1
    per_class = {}
    for label in LABELS:
        tp = matrix[label, label]
        support = int(matrix[label].sum())
        predicted_count = int(matrix[:, label].sum())
        precision = tp / predicted_count if predicted_count else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[str(label)] = {"name": LABEL_NAMES[label], "precision": precision, "recall": recall,
                                 "f1": f1, "support": support}
    recalls = [per_class[str(label)]["recall"] for label in LABELS]
    f1s = [per_class[str(label)]["f1"] for label in LABELS]
    return {"macroF1": float(np.mean(f1s)), "balancedAccuracy": float(np.mean(recalls)),
            "accuracy": float(np.mean(actual == predicted)), "perClass": per_class,
            "confusionMatrixActualRowsPredictedColumns": matrix.tolist(),
            "classSupport": {str(label): per_class[str(label)]["support"] for label in LABELS}}


def per_animal_metrics(frame: pd.DataFrame, predictions: np.ndarray) -> dict:
    if len(frame) != len(predictions):
        raise ValueError("Per-animal predictions do not align with scored rows")
    result = {}
    for animal, positions in frame.groupby("animal_id", sort=True).indices.items():
        ix = np.asarray(positions, dtype=int)
        y = frame.iloc[ix]["reference_majority_class"].to_numpy(dtype=int)
        metric = classification_metrics(y, predictions[ix])
        present_all_classes = set(y) == set(LABELS)
        result[f"{int(animal):02d}"] = {
            "eligibleSeconds": int(len(ix)), "accuracy": metric["accuracy"],
            "macroF1": metric["macroF1"] if present_all_classes else None,
            "macroF1DefinedAllClassesPresent": present_all_classes,
            "perClass": metric["perClass"],
            "confusionMatrixActualRowsPredictedColumns": metric["confusionMatrixActualRowsPredictedColumns"],
        }
    return result


def development_leave_one_animal_out(train: pd.DataFrame) -> dict:
    _assert_train_only(train)
    animals = sorted(set(train["animal_id"].astype(int)))
    if len(animals) < 2:
        raise ValueError("Leave-one-animal-out development needs at least two source-train animals")
    predictions = np.full(len(train), -1, dtype=int)
    fold_records = []
    fit_cpu = []
    inference_cpu = []
    for animal in animals:
        valid_ix = np.flatnonzero(train["animal_id"].to_numpy(dtype=int) == animal)
        fit_frame = train.iloc[np.flatnonzero(train["animal_id"].to_numpy(dtype=int) != animal)].copy()
        _assert_train_only(fit_frame)
        if set(fit_frame["animal_id"].astype(int)) & {animal}:
            raise AssertionError("LOAO animal leaked across fit/validation")
        model, fit_time = fit_random_forest(fit_frame)
        x = train.iloc[valid_ix].loc[:, FEATURES].to_numpy(dtype=float)
        start = time.process_time()
        predictions[valid_ix] = model.predict(x).astype(int)
        predict_time = time.process_time() - start
        fit_cpu.append(fit_time)
        inference_cpu.append(predict_time)
        fold_records.append({"validationAnimal": f"{animal:02d}",
                             "fitAnimals": [f"{a:02d}" for a in sorted(set(fit_frame["animal_id"].astype(int)))],
                             "validationEligibleSeconds": int(len(valid_ix)), "fitCpuSeconds": fit_time,
                             "inferenceCpuSeconds": predict_time})
    if np.any(predictions < 0):
        raise AssertionError("LOAO development OOF predictions are incomplete")
    y = train["reference_majority_class"].to_numpy(dtype=int)
    return {"metrics": classification_metrics(y, predictions), "perAnimal": per_animal_metrics(train, predictions),
            "folds": fold_records, "fitCpuSecondsTotal": float(sum(fit_cpu)),
            "fitCpuSecondsMeanPerFold": float(np.mean(fit_cpu)),
            "inferenceCpuSecondsTotal": float(sum(inference_cpu)), "predictions": predictions}


def evaluate(train: pd.DataFrame, test: pd.DataFrame) -> dict:
    """Fit fixed procedures on source-train only; score source-test once after fitting."""
    _assert_train_only(train)
    if test.empty or test["source_split"].isna().any() or set(test["source_split"]) != {"source_test"}:
        raise ValueError("Final evaluation must receive only source_test rows")
    test_animals = set(test["animal_id"].astype(int))
    if test_animals != TEST_ANIMALS:
        raise ValueError("Final evaluation requires exactly frozen source-test animals 04, 10, and 11")
    if set(train["animal_id"].astype(int)) & test_animals:
        raise ValueError("Source-test animals overlap fitting animals")
    dev = development_leave_one_animal_out(train)
    y_test = test["reference_majority_class"].to_numpy(dtype=int)
    training_class = training_majority(train)
    baseline_pred, baseline_infer_cpu = predict_training_majority(training_class, len(test))
    baseline_metrics = classification_metrics(y_test, baseline_pred)
    baseline_animals = per_animal_metrics(test, baseline_pred)
    model, fit_cpu = fit_random_forest(train)
    x_test = test.loc[:, FEATURES].to_numpy(dtype=float)
    rf_pred = np.full(len(test), -1, dtype=int)
    per_animal_timing = {}
    for animal, positions in test.groupby("animal_id", sort=True).indices.items():
        ix = np.asarray(positions, dtype=int)
        start = time.process_time()
        rf_pred[ix] = model.predict(x_test[ix]).astype(int)
        per_animal_timing[f"{int(animal):02d}"] = time.process_time() - start
    if np.any(rf_pred < 0):
        raise AssertionError("Source-test predictions are incomplete")
    infer_cpu = float(sum(per_animal_timing.values()))
    rf_metrics = classification_metrics(y_test, rf_pred)
    rf_animals = per_animal_metrics(test, rf_pred)
    return {
        "developmentSourceTrainLeaveOneAnimalOut": {k: v for k, v in dev.items() if k != "predictions"},
        "finalSourceTest": {
            "animals": sorted(f"{animal:02d}" for animal in test_animals),
            "trainingAnimals": sorted(f"{animal:02d}" for animal in set(train["animal_id"].astype(int))),
            "animalOverlap": [],
            "trainingMajorityClass": training_class,
            "models": {
                "training_majority_baseline": {**baseline_metrics, "perAnimal": baseline_animals,
                                                "fitCpuSeconds": 0.0, "inferenceCpuSeconds": baseline_infer_cpu},
                "random_forest_fixed": {**rf_metrics, "perAnimal": rf_animals,
                                         "fitCpuSeconds": fit_cpu, "inferenceCpuSeconds": infer_cpu,
                                         "perAnimalInferenceCpuSeconds": per_animal_timing},
            },
            "predictions": {"training_majority_baseline": baseline_pred.tolist(),
                            "random_forest_fixed": rf_pred.tolist()},
        },
    }


def render_markdown(report: dict) -> str:
    final = report["evaluation"]["finalSourceTest"]
    lines = [
        "# Precision Beef instrument-agreement diagnostic", "",
        "This is a source-split agreement diagnostic for collar summaries against RumiWatch instrument classifications. It is not human-video ground truth, a new literature-independent holdout, grazing validation, or Riose validation.", "",
        f"Source: Zenodo [10.5281/zenodo.4064802](https://doi.org/10.5281/zenodo.4064802), {report['source']['license']}. Protocol: `preregistration.json`.", "",
        "## Frozen final source-test results", "",
        "| Model | Macro-F1 | Balanced accuracy | Accuracy | Fit CPU seconds | Inference CPU seconds |", "|---|---:|---:|---:|---:|---:|",
    ]
    for model_id, metrics in final["models"].items():
        lines.append(f"| {model_id} | {metrics['macroF1']:.3f} | {metrics['balancedAccuracy']:.3f} | {metrics['accuracy']:.3f} | {metrics['fitCpuSeconds']:.4f} | {metrics['inferenceCpuSeconds']:.4f} |")
    lines += ["", "Per-class metrics, each animal's confusion matrix, the 15-animal source-train LOAO development result, and completeness/tie coverage are in `results.json`.", "",
              "## Limits", "",
              "RumiWatch is an instrument-derived reference, with drinking merged into eating. Test animals 04, 10, and 11 have already appeared in the primary paper's test results. One test animal comes from each of three trials, which is insufficient for trial or farm transfer claims. No seconds are treated as independent uncertainty units.", ""]
    return "\n".join(lines)


def run(manifest_path: Path = MANIFEST_PATH, output_dir: Path = HERE) -> dict:
    prereg = load_preregistration()
    raw, provenance = load_processed_parquets(manifest_path)
    eligible, coverage = eligible_seconds(raw)
    train = eligible.loc[eligible["source_split"] == "source_train"].reset_index(drop=True)
    test = eligible.loc[eligible["source_split"] == "source_test"].reset_index(drop=True)
    expected_train_animals = EXPECTED_ANIMALS - TEST_ANIMALS
    if set(train["animal_id"].astype(int)) != expected_train_animals:
        raise ValueError("Every one of the 15 source-train animals must have eligible seconds")
    if set(test["animal_id"].astype(int)) != TEST_ANIMALS:
        raise ValueError("Eligible final test data must include all frozen animals 04, 10, and 11")
    result = evaluate(train, test)
    report = {
        "kind": "precision_beef_instrument_agreement_source_split_diagnostic",
        "preregistration": {"path": PREREG_PATH.relative_to(ROOT).as_posix(), "status": prereg["status"],
                            "registeredAt": prereg["registeredAt"], "fixedFeatures": list(FEATURES),
                            "testAnimals": sorted(f"{animal:02d}" for animal in TEST_ANIMALS)},
        "source": provenance,
        "cohortCoverage": coverage,
        "evaluation": result,
        "limitations": prereg["interpretationLimits"],
        "reproducibility": {"pythonVersion": platform.python_version(), "numpyVersion": np.__version__,
                            "pandasVersion": pd.__version__, "scikitLearnVersion": sklearn.__version__,
                            "seed": SEED, "parquetSha256": provenance["processedOutputSha256"],
                            "deterministicModelPrediction": True},
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    prediction_path = output_dir / "predictions.csv"
    test_rows = test.copy()
    test_rows["pred_training_majority_baseline"] = result["evaluation"]["finalSourceTest"]["predictions"]["training_majority_baseline"]
    test_rows["pred_random_forest_fixed"] = result["evaluation"]["finalSourceTest"]["predictions"]["random_forest_fixed"]
    test_rows = test_rows[["animal_id", "farm_trial_id", "timestamp_second", "source_split",
                           "reference_majority_class", *FEATURES, "pred_training_majority_baseline", "pred_random_forest_fixed"]]
    test_rows.to_csv(prediction_path, index=False)
    report["reproducibility"]["predictionCsvSha256"] = sha256_file(prediction_path)
    output_json = output_dir / "results.json"
    output_md = output_dir / "results.md"
    output_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    output_md.write_text(render_markdown(report), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--output-dir", type=Path, default=HERE)
    args = parser.parse_args(argv)
    report = run(args.manifest, args.output_dir)
    print(json.dumps({"status": "complete", "sourceTestAnimals": report["evaluation"]["finalSourceTest"]["animals"],
                      "macroF1": {key: value["macroF1"] for key, value in report["evaluation"]["finalSourceTest"]["models"].items()}}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
