#!/usr/bin/env python3
"""Fit and export the fixed RF on development animals only; no evaluation."""
from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
import evaluate_90s_windows as windows  # noqa: E402
import evaluate_instrument_agreement as fixed  # noqa: E402
from model_package.artifact_io import serialize_forest, write_artifact  # noqa: E402
from process_90s_windows import FEATURES, LABELS  # noqa: E402

REPORT_PATH = ROOT / "data/precision-beef/processing-report-90s.json"
DEFAULT_ARTIFACT = HERE / "artifacts/precision-beef-90s-rf-v1.json.gz"
EXPECTED_TRAIN_ANIMALS = sorted(fixed.EXPECTED_ANIMALS - fixed.TEST_ANIMALS)
EXPECTED_SKLEARN_VERSION = "1.5.2"


def _assert_development_only(frame: pd.DataFrame) -> None:
    if frame.empty or frame["animal_id"].isna().any():
        raise ValueError("Training needs nonempty rows with animal IDs")
    animals = set(frame["animal_id"].astype(int))
    if animals & fixed.TEST_ANIMALS:
        raise ValueError("Source-test animals may not enter model fitting or development")
    if frame["source_split"].isna().any() or set(frame["source_split"]) != {"source_train"}:
        raise ValueError("Training received rows outside source_train")


def _equal_animal_weights(frame: pd.DataFrame) -> np.ndarray:
    counts = frame.groupby("animal_id")["animal_id"].transform("size").to_numpy(dtype=float)
    if len(counts) == 0 or np.any(counts <= 0):
        raise ValueError("Training rows need eligible windows for each animal")
    return 1.0 / counts


def load_development_only(report_path: Path = REPORT_PATH, root: Path = ROOT) -> tuple[pd.DataFrame, dict]:
    """Read only the 15 source-train Parquets; never open held-out Parquets."""
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("kind") != "precision_beef_90s_window_processing" or report.get("windowSeconds") != 90:
        raise ValueError("Expected verified Precision Beef 90-second processing report")
    source = report.get("source", {})
    if source.get("doi") != "10.5281/zenodo.4064802" or source.get("license") != "CC BY 4.0" or source.get("rawChecksumsVerified") is not True:
        raise ValueError("Expected checksum-verified public CC BY 4.0 source")
    by_id = {int(item["animalId"]): item for item in report.get("perAnimal", [])}
    if set(by_id) != fixed.EXPECTED_ANIMALS or report.get("sourceTestAnimals") != sorted(fixed.TEST_ANIMALS):
        raise ValueError("Processing report differs from frozen source animal split")
    frames, input_checksums = [], {}
    for animal in EXPECTED_TRAIN_ANIMALS:
        item = by_id[animal]
        if item.get("sourceSplit") != "source_train" or item.get("farmTrialId") != fixed.TRIAL_BY_ANIMAL[animal]:
            raise ValueError(f"Invalid development metadata for animal {animal:02d}")
        relative = Path(item["outputPath"])
        path = (root / relative).resolve()
        if relative.is_absolute() or root.resolve() not in path.parents or not path.is_file():
            raise FileNotFoundError(f"Missing or unsafe development Parquet for animal {animal:02d}")
        digest = fixed.sha256_file(path)
        if digest != item.get("outputSha256"):
            raise ValueError(f"Development Parquet checksum mismatch for animal {animal:02d}")
        frame = pd.read_parquet(path)
        windows.validate_90s_frame(frame, animal, expected_rows=item.get("outputRows"), context=path.name)
        frames.append(frame)
        input_checksums[f"{animal:02d}"] = digest
    data = pd.concat(frames, ignore_index=True)
    if set(data["animal_id"].astype(int)) != set(EXPECTED_TRAIN_ANIMALS):
        raise ValueError("Loaded rows do not contain exactly the development animals")
    if set(data["source_split"]) != {"source_train"} or set(data["animal_id"].astype(int)) & fixed.TEST_ANIMALS:
        raise ValueError("Held-out source animals entered development input")
    eligible, _ = windows.eligible_windows(data)
    if set(eligible["animal_id"].astype(int)) != set(EXPECTED_TRAIN_ANIMALS):
        raise ValueError("Every development animal must have eligible windows")
    return eligible, {"doi": source["doi"], "license": source["license"],
                      "sourceTestAnimalsNeverOpened": sorted(f"{animal:02d}" for animal in fixed.TEST_ANIMALS),
                      "trainingAnimals": [f"{animal:02d}" for animal in EXPECTED_TRAIN_ANIMALS],
                      "inputParquetSha256": input_checksums}


def train_artifact(frame: pd.DataFrame, source: dict, artifact_path: Path = DEFAULT_ARTIFACT) -> tuple[dict, dict]:
    if sklearn.__version__ != EXPECTED_SKLEARN_VERSION:
        raise RuntimeError(f"Artifact reproduction requires scikit-learn=={EXPECTED_SKLEARN_VERSION}; found {sklearn.__version__}")
    _assert_development_only(frame)
    if set(frame["animal_id"].astype(int)) != set(EXPECTED_TRAIN_ANIMALS):
        raise ValueError("Final artifact must use all and only the 15 development animals")
    model = RandomForestClassifier(**fixed.RF_PARAMETERS)
    model.fit(frame.loc[:, FEATURES].to_numpy(dtype=float),
              frame["reference_majority_class"].to_numpy(dtype=int),
              sample_weight=_equal_animal_weights(frame))
    metadata = {
        "artifactId": "precision-beef-90s-collar-rumiwatch-rf-v1",
        "sourceDoi": source["doi"],
        "license": source["license"],
        "labelSource": "RumiWatch halter instrument-derived majority class; not human-video annotation",
        "scope": "Experimental instrument-agreement classifier for housed finishing steers in the Precision Beef cohort; not pasture behavior, DMI, ADG, or Riose engine validation.",
        "population": "18 Limousin-cross housed finishing steers in three UK farm trials; exact age not reported.",
        "alignment": "90-second half-open wall-clock windows anchored to the README paired rounded start; source-naive timestamps.",
        "featureWindowRule": "Twelve collar-only x/y/z mean, population SD, min, max features per eligible 90-second window; units mg.",
        "features": list(FEATURES),
        "classNames": {str(label): fixed.LABEL_NAMES[label] for label in LABELS},
        "model": {"estimator": "sklearn.ensemble.RandomForestClassifier", **fixed.RF_PARAMETERS,
                  "trainingWeighting": "Equal total sample weight per development animal; each eligible window receives 1 / that animal's eligible window count."},
        "trainedAnimals": source["trainingAnimals"],
        "trainingRows": int(len(frame)),
        "trainingLabelCounts": {str(int(k)): int(v) for k, v in frame["reference_majority_class"].value_counts().sort_index().items()},
        "trainingOnly": True,
        "evaluationPerformedByThisCommand": False,
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "scikitLearn": sklearn.__version__},
    }
    artifact = serialize_forest(model, FEATURES, LABELS, metadata)
    manifest = {"manifestSchemaVersion": "1.0.0", "artifactId": metadata["artifactId"],
                "format": artifact["format"], "scope": metadata["scope"], "sourceDoi": source["doi"],
                "license": source["license"], "trainingAnimals": metadata["trainedAnimals"],
                "trainingRows": metadata["trainingRows"], "runtime": metadata["runtime"],
                "inputParquetSha256": source["inputParquetSha256"],
                "heldOutAnimalsExcluded": source["sourceTestAnimalsNeverOpened"]}
    manifest_path = artifact_path.with_suffix(".manifest.json")
    digest = write_artifact(artifact, artifact_path, manifest_path, manifest)
    return artifact, {**manifest, "artifactSha256": digest, "artifactPath": str(artifact_path)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()
    development, provenance = load_development_only()
    _, artifact_manifest = train_artifact(development, provenance, args.artifact)
    print(json.dumps(artifact_manifest, indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
