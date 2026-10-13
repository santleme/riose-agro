"""Leakage-safe protocol primitives for the gated DMI baseline.

These helpers are methodology only. They do not fit a model or make the
current no-go cohort eligible.
"""

from __future__ import annotations

import hashlib
import math
from collections import defaultdict
from typing import Any, Iterable


PARTITIONS = ("train", "validation", "test")


def grouped_split(
    rows: list[dict[str, Any]],
    *,
    seed: int,
    fractions: dict[str, float] | None = None,
    study_key: str = "study_or_trial_id",
    animal_key: str = "animal_id",
) -> dict[str, str]:
    """Return animal-period ID -> partition with trial and animal isolation.

    Rows connected through either the same study/trial or same animal are
    assigned as one component. This is stricter than splitting on one key and
    prevents repeated animals from crossing trials from leaking across splits.
    """
    fractions = fractions or {"train": 0.6, "validation": 0.2, "test": 0.2}
    if set(fractions) != set(PARTITIONS) or any(value <= 0 for value in fractions.values()):
        raise ValueError("fractions must provide positive train, validation, and test values")
    total_fraction = sum(fractions.values())
    if not math.isclose(total_fraction, 1.0, rel_tol=0, abs_tol=1e-9):
        raise ValueError("partition fractions must sum to one")

    parent: dict[str, str] = {}

    def find(item: str) -> str:
        parent.setdefault(item, item)
        if parent[item] != item:
            parent[item] = find(parent[item])
        return parent[item]

    def union(left: str, right: str) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parent[max(left_root, right_root)] = min(left_root, right_root)

    row_ids: set[str] = set()
    entity_keys: list[tuple[str, str, str]] = []
    for row in rows:
        row_id = row.get("animal_period_id")
        study = row.get(study_key)
        animal = row.get(animal_key)
        if not all(isinstance(value, str) and value.strip() for value in (row_id, study, animal)):
            raise ValueError("each row requires non-empty animal_period_id, study/trial, and animal IDs")
        if row_id in row_ids:
            raise ValueError(f"duplicate animal_period_id: {row_id}")
        row_ids.add(row_id)
        study_entity, animal_entity = f"study:{study}", f"animal:{animal}"
        union(study_entity, animal_entity)
        entity_keys.append((row_id, study_entity, animal_entity))

    if not rows:
        raise ValueError("at least three independent grouped components are required")

    component_rows: dict[str, list[str]] = defaultdict(list)
    for row_id, study_entity, _animal_entity in entity_keys:
        component_rows[find(study_entity)].append(row_id)
    if len(component_rows) < 3:
        raise ValueError("at least three independent grouped components are required")

    # Largest-first balanced assignment. Hash tie-breaking makes the result
    # deterministic for a seed without depending on input row order.
    def tie_key(component: str) -> str:
        return hashlib.sha256(f"{seed}:{component}".encode()).hexdigest()

    ordered = sorted(component_rows, key=lambda key: (-len(component_rows[key]), tie_key(key)))
    totals = {partition: 0 for partition in PARTITIONS}
    target = {partition: fractions[partition] * len(rows) for partition in PARTITIONS}
    assignments: dict[str, str] = {}
    for component in ordered:
        partition = max(
            PARTITIONS,
            key=lambda candidate: (target[candidate] - totals[candidate], -PARTITIONS.index(candidate)),
        )
        totals[partition] += len(component_rows[component])
        for row_id in component_rows[component]:
            assignments[row_id] = partition
    return assignments


def fit_standardizer(
    rows: list[dict[str, Any]],
    feature_names: Iterable[str],
    partitions: dict[str, str],
    *,
    row_id_key: str = "animal_period_id",
) -> dict[str, dict[str, float]]:
    """Fit means/scales on training rows only; reject non-finite inputs."""
    train = [row for row in rows if partitions.get(row.get(row_id_key)) == "train"]
    if not train:
        raise ValueError("at least one training row is required to fit preprocessing")
    result: dict[str, dict[str, float]] = {}
    for feature in feature_names:
        values = [row.get(feature) for row in train]
        if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
            raise ValueError(f"training feature {feature} must contain only finite numeric values")
        mean = math.fsum(values) / len(values)
        variance = math.fsum((value - mean) ** 2 for value in values) / len(values)
        scale = math.sqrt(variance) or 1.0
        result[feature] = {"mean": mean, "scale": scale}
    return result


def transform_features(
    rows: list[dict[str, Any]],
    feature_names: Iterable[str],
    standardizer: dict[str, dict[str, float]],
) -> list[list[float]]:
    """Apply a frozen standardizer without refitting on validation/test rows."""
    names = list(feature_names)
    if set(names) != set(standardizer):
        raise ValueError("standardizer feature names do not match requested features")
    matrix: list[list[float]] = []
    for row in rows:
        transformed = []
        for feature in names:
            value = row.get(feature)
            if not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"feature {feature} must contain only finite numeric values")
            params = standardizer[feature]
            if not math.isfinite(params.get("mean", math.nan)) or not math.isfinite(params.get("scale", math.nan)) or params["scale"] <= 0:
                raise ValueError(f"invalid fitted preprocessing values for {feature}")
            transformed.append((value - params["mean"]) / params["scale"])
        matrix.append(transformed)
    return matrix


def regression_metrics(observed: Iterable[float], predicted: Iterable[float]) -> dict[str, float]:
    """Compute deterministic MAE, RMSE, and prediction-minus-observation bias."""
    observed_values, predicted_values = list(observed), list(predicted)
    if not observed_values or len(observed_values) != len(predicted_values):
        raise ValueError("observed and predicted values must have the same non-zero length")
    errors = []
    for actual, estimate in zip(observed_values, predicted_values):
        if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (actual, estimate)):
            raise ValueError("observed and predicted values must be finite numbers")
        errors.append(estimate - actual)
    return {
        "mae": math.fsum(abs(error) for error in errors) / len(errors),
        "rmse": math.sqrt(math.fsum(error * error for error in errors) / len(errors)),
        "bias": math.fsum(errors) / len(errors),
    }
