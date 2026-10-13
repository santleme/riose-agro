from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
from model_package.inference import load_model, predict_features  # noqa: E402
from model_package.artifact_io import serialize_forest, write_artifact  # noqa: E402
from process_90s_windows import FEATURES  # noqa: E402
from train_behavior_artifact import train_artifact  # noqa: E402


def fixture_artifact() -> dict:
    metadata = {
        "artifactId": "fixture-rf",
        "sourceDoi": "10.5281/zenodo.4064802",
        "labelSource": "RumiWatch instrument-derived labels",
        "model": {"estimator": "RandomForestClassifier"},
        "trainedAnimals": ["01"],
        "scope": "Experimental housed-steer instrument-agreement only; no pasture, DMI, ADG or engine validation.",
        "features": list(FEATURES),
    }
    return {
        "schemaVersion": "riose.precision-beef.behavior-forest.v1",
        "format": "rfc_json_tree_arrays_v1",
        "features": list(FEATURES),
        "featureUnit": "mg",
        "classes": [0, 1, 2],
        "metadata": metadata,
        "trees": [
            {"left": [1, -1, -1], "right": [2, -1, -1], "feature": [0, -2, -2],
             "threshold": [0.0, -2.0, -2.0], "leafNode": [1, 2],
             "leafClassMass": [[5, 0, 0], [0, 5, 0]]},
            {"left": [-1], "right": [-1], "feature": [-2], "threshold": [-2.0],
             "leafNode": [0], "leafClassMass": [[0, 5, 0]]},
        ],
    }


def save_fixture(tmp_path: Path) -> tuple[Path, Path]:
    artifact_path = tmp_path / "fixture.json"
    manifest_path = tmp_path / "fixture.manifest.json"
    payload = (json.dumps(fixture_artifact(), sort_keys=True, separators=(",", ":")) + "\n").encode()
    artifact_path.write_bytes(payload)
    manifest_path.write_text(json.dumps({"artifactSha256": hashlib.sha256(payload).hexdigest(),
                                         "artifactFile": artifact_path.name,
                                         "artifactId": "fixture-rf", "sourceDoi": "10.5281/zenodo.4064802"}), encoding="utf-8")
    return artifact_path, manifest_path


class PrecisionBeefModelPackageTests(unittest.TestCase):
    def test_json_inference_returns_only_class_and_scientific_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path, manifest_path = save_fixture(Path(directory))
            model = load_model(artifact_path, manifest_path)
            feature_vector = {feature: 0.0 for feature in FEATURES}
            feature_vector[FEATURES[0]] = -1.0
            result = predict_features(feature_vector, model)
            # Tree vote probabilities tie class 0 and class 1; argmax takes the first class.
            self.assertEqual(result["classCode"], 0)
            self.assertEqual(result["className"], "other")
            self.assertEqual(result["provenance"]["sourceDoi"], "10.5281/zenodo.4064802")
            self.assertEqual(result["provenance"]["artifactSha256"], model["sha256"])
            self.assertIn("housed-steer", result["scope"])
            self.assertIn("pasture", result["scope"])
            self.assertNotIn("probability", result)

    def test_feature_contract_and_hash_are_enforced(self):
        with tempfile.TemporaryDirectory() as directory:
            artifact_path, manifest_path = save_fixture(Path(directory))
            model = load_model(artifact_path, manifest_path)
            with self.assertRaisesRegex(ValueError, "Feature keys differ"):
                predict_features({"x_mean_mg": 1.0}, model)
            artifact_path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                load_model(artifact_path, manifest_path)

    def test_trainer_rejects_source_test_rows_before_fitting(self):
        with tempfile.TemporaryDirectory() as directory:
            row = {feature: 0.0 for feature in FEATURES}
            row.update({"animal_id": 4, "source_split": "source_test", "reference_majority_class": 0})
            frame = pd.DataFrame([row])
            provenance = {"doi": "10.5281/zenodo.4064802", "license": "CC BY 4.0",
                          "trainingAnimals": ["04"], "inputParquetSha256": {}}
            output = Path(directory) / "never-written.json"
            with self.assertRaisesRegex(ValueError, "Source-test animals"):
                train_artifact(frame, provenance, output)
            self.assertFalse(output.exists())

    def test_json_tree_export_matches_sklearn_on_small_fixture(self):
        rng = np.random.default_rng(14)
        x = rng.normal(size=(90, len(FEATURES))).astype(np.float32)
        y = np.tile(np.asarray([0, 1, 2], dtype=int), 30)
        model = RandomForestClassifier(n_estimators=7, max_depth=4, random_state=9, n_jobs=1)
        model.fit(x, y)
        metadata = {"artifactId": "serializer-test", "sourceDoi": "fixture",
                    "labelSource": "fixture labels", "model": {"estimator": "fixture"},
                    "trainedAnimals": ["fixture"], "scope": "test fixture only",
                    "features": list(FEATURES)}
        artifact = serialize_forest(model, FEATURES, (0, 1, 2), metadata)
        with tempfile.TemporaryDirectory() as directory:
            artifact_path = Path(directory) / "fixture.json.gz"
            manifest_path = Path(directory) / "fixture.manifest.json"
            write_artifact(artifact, artifact_path, manifest_path,
                           {"artifactId": "serializer-test", "sourceDoi": "fixture"})
            loaded = load_model(artifact_path, manifest_path)
            for row, expected in zip(x, model.predict(x), strict=True):
                input_features = {name: float(value) for name, value in zip(FEATURES, row, strict=True)}
                self.assertEqual(predict_features(input_features, loaded)["classCode"], int(expected))


if __name__ == "__main__":
    unittest.main()
