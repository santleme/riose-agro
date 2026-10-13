"""Dependency-light JSON forest inference with explicit scientific scope."""
from __future__ import annotations

import hashlib
import gzip
import json
import math
import struct
from pathlib import Path
from typing import Mapping

LABEL_NAMES = {0: "other", 1: "rumination", 2: "eating_or_drinking"}
EXPECTED_FEATURES = [
    "x_mean_mg", "x_std_population_mg", "x_min_mg", "x_max_mg",
    "y_mean_mg", "y_std_population_mg", "y_min_mg", "y_max_mg",
    "z_mean_mg", "z_std_population_mg", "z_min_mg", "z_max_mg",
]


def load_model(artifact_path: Path, manifest_path: Path | None = None) -> dict:
    artifact_path = Path(artifact_path)
    manifest_path = Path(manifest_path) if manifest_path else artifact_path.with_suffix(".manifest.json")
    encoded = artifact_path.read_bytes()
    decoded = gzip.decompress(encoded) if artifact_path.suffix == ".gz" else encoded
    artifact = json.loads(decoded.decode("utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    digest = hashlib.sha256(encoded).hexdigest()
    if digest != manifest.get("artifactSha256"):
        raise ValueError("Model artifact SHA-256 does not match its manifest")
    if manifest.get("artifactFile") != artifact_path.name:
        raise ValueError("Model artifact filename differs from its manifest")
    if artifact.get("schemaVersion") != "riose.precision-beef.behavior-forest.v1":
        raise ValueError("Unsupported behavior artifact schema")
    if artifact.get("format") != "rfc_json_tree_arrays_v1":
        raise ValueError("Unsupported behavior artifact format")
    if artifact.get("classes") != [0, 1, 2] or artifact.get("featureUnit") != "mg":
        raise ValueError("Unexpected class or feature-unit contract")
    metadata = artifact.get("metadata", {})
    if artifact.get("features") != EXPECTED_FEATURES or artifact.get("features") != metadata.get("features"):
        raise ValueError("Model feature contract is missing or inconsistent")
    if manifest.get("artifactId") != metadata.get("artifactId") or manifest.get("sourceDoi") != metadata.get("sourceDoi"):
        raise ValueError("Model manifest provenance differs from artifact metadata")
    if not artifact.get("trees"):
        raise ValueError("Model artifact contains no trees")
    for tree in artifact["trees"]:
        size = len(tree.get("left", []))
        if size == 0 or any(len(tree.get(field, [])) != size for field in ("right", "feature", "threshold")):
            raise ValueError("Malformed tree arrays")
        if len(tree.get("leafNode", [])) != len(tree.get("leafClassMass", [])) or not tree["leafNode"]:
            raise ValueError("Malformed leaf class-mass arrays")
        if any(len(mass) != 3 for mass in tree["leafClassMass"]):
            raise ValueError("Malformed tree class-mass array")
        tree["_leafClassMassByNode"] = dict(zip(tree["leafNode"], tree["leafClassMass"], strict=True))
    return {"artifact": artifact, "manifest": manifest, "sha256": digest}


def _validated_vector(features: Mapping[str, object], expected: list[str]) -> list[float]:
    if not isinstance(features, Mapping):
        raise ValueError("Features must be a mapping from registered names to numeric values")
    missing = set(expected) - set(features)
    extra = set(features) - set(expected)
    if missing or extra:
        raise ValueError(f"Feature keys differ from model contract; missing={sorted(missing)}, extra={sorted(extra)}")
    values = []
    for key in expected:
        try:
            value = float(features[key])
        except (TypeError, ValueError) as error:
            raise ValueError(f"Feature {key} must be numeric") from error
        if not math.isfinite(value):
            raise ValueError(f"Feature {key} must be finite")
        values.append(value)
    return values


def _tree_probabilities(tree: dict, vector: list[float]) -> list[float]:
    node = 0
    while tree["left"][node] != -1:
        feature_index = tree["feature"][node]
        if feature_index < 0 or feature_index >= len(vector):
            raise ValueError("Tree references a feature outside the declared contract")
        node = tree["left"][node] if vector[feature_index] <= tree["threshold"][node] else tree["right"][node]
        if node < 0 or node >= len(tree["left"]):
            raise ValueError("Tree child reference is invalid")
    if node not in tree["_leafClassMassByNode"]:
        raise ValueError("Reached a leaf without a class mass")
    mass = [float(value) for value in tree["_leafClassMassByNode"][node]]
    total = sum(mass)
    if not math.isfinite(total) or total <= 0 or any(not math.isfinite(value) or value < 0 for value in mass):
        raise ValueError("Tree leaf has invalid class mass")
    return [value / total for value in mass]


def predict_features(features: Mapping[str, object], loaded: dict) -> dict:
    artifact = loaded["artifact"]
    # sklearn's tree predictor casts input features to float32 before comparing
    # them with the stored float64 thresholds; preserve that inference contract.
    vector = []
    for value in _validated_vector(features, artifact["features"]):
        try:
            single_precision = struct.unpack("f", struct.pack("f", value))[0]
        except OverflowError as error:
            raise ValueError("Feature value exceeds the float32 range used by the fitted tree model") from error
        if not math.isfinite(single_precision):
            raise ValueError("Feature value exceeds the float32 range used by the fitted tree model")
        vector.append(single_precision)
    sums = [0.0, 0.0, 0.0]
    for tree in artifact["trees"]:
        probabilities = _tree_probabilities(tree, vector)
        for i, probability in enumerate(probabilities):
            sums[i] += probability
    class_code = max(range(3), key=lambda i: sums[i])
    metadata = artifact["metadata"]
    return {
        "classCode": class_code,
        "className": LABEL_NAMES[class_code],
        "scope": metadata["scope"],
        "provenance": {
            "artifactId": metadata["artifactId"],
            "artifactSha256": loaded["sha256"],
            "sourceDoi": metadata["sourceDoi"],
            "labelSource": metadata["labelSource"],
            "model": metadata["model"],
            "trainedAnimals": metadata["trainedAnimals"],
        },
    }
