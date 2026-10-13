"""Safe JSON serialization for the fixed Precision Beef random forest."""
from __future__ import annotations

import hashlib
import gzip
import json
from pathlib import Path

import numpy as np


def canonical_json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def serialize_forest(model, features: tuple[str, ...], labels: tuple[int, ...], metadata: dict) -> dict:
    """Export fitted sklearn tree arrays as data, never executable pickle."""
    classes = [int(value) for value in model.classes_]
    if classes != list(labels):
        raise ValueError(f"Unexpected estimator class order: {classes}")
    trees = []
    for estimator in model.estimators_:
        tree = estimator.tree_
        left = tree.children_left.astype(int).tolist()
        right = tree.children_right.astype(int).tolist()
        feature = tree.feature.astype(int).tolist()
        threshold = tree.threshold.astype(float).tolist()
        raw = np.asarray(tree.value[:, 0, :], dtype=np.float64)
        if raw.shape != (tree.node_count, len(labels)):
            raise ValueError("Unexpected sklearn tree value shape")
        # sklearn stores class mass; normalize leaves during inference. Retain
        # nodes as three finite nonnegative class masses in sorted label order.
        leaf_indices = [index for index, child in enumerate(left) if child == -1]
        trees.append({"left": left, "right": right, "feature": feature,
                      "threshold": threshold, "leafNode": leaf_indices,
                      "leafClassMass": raw[leaf_indices].tolist()})
    return {
        "schemaVersion": "riose.precision-beef.behavior-forest.v1",
        "format": "rfc_json_tree_arrays_v1",
        "features": list(features),
        "featureUnit": "mg",
        "classes": list(labels),
        "trees": trees,
        "metadata": metadata,
    }


def write_artifact(artifact: dict, artifact_path: Path, manifest_path: Path, manifest: dict) -> str:
    payload = canonical_json_bytes(artifact)
    encoded = gzip.compress(payload, compresslevel=9, mtime=0) if artifact_path.suffix == ".gz" else payload
    digest = sha256_bytes(encoded)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_bytes(encoded)
    result = dict(manifest)
    result["artifactFile"] = artifact_path.name
    result["artifactSha256"] = digest
    manifest_path.write_text(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    return digest
