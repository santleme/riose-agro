#!/usr/bin/env python3
"""Run the separately scoped, grouped finishing-steer DMI experiment.

This experiment is not the mature-cow pasture target in issues #109/#110.
Dependencies are research-only; see requirements-research-ml.txt.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[3]
PROTOCOL_PATH = ROOT / "experiments/dmi-finishing-steers/protocol-v1.json"
SOURCE_PATH = ROOT / "data/dryad-finishing-steers/Database_09-11-2025.csv"
AUDIT_PATH = ROOT / "docs/evidence/dryad-finishing-steers-audit.json"
OUTPUT_PATH = ROOT / "docs/evidence/dmi-finishing-steers-experiment-v1.json"
NUMERIC_FEATURES = [
    "ADG_Fin", "SMBW_Fin", "CP_%", "NDF_%", "Hem_%", "ADF_%", "Lig_%",
    "Cel_%", "NFC_%", "Sta_%", "EE_%", "Ash_%", "Forage_%", "TDN_%",
    "NEm_Mcalkg", "NEg_Mcalkg", "GE_Mcalkg",
]
CATEGORICAL_FEATURES = ["Breed"]
TARGET = "DMI_Fin"
GROUP = "Project"
ANIMAL = "Animal"
SEED = 20261013


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def metrics(observed: list[float], predicted: list[float]) -> dict[str, float]:
    errors = np.asarray(predicted, dtype=np.float64) - np.asarray(observed, dtype=np.float64)
    return {
        "mae": float(np.mean(np.abs(errors))),
        "rmse": float(np.sqrt(np.mean(np.square(errors)))),
        "biasPredictionMinusObserved": float(np.mean(errors)),
    }


def load_rows() -> list[dict[str, str]]:
    with SOURCE_PATH.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if not rows:
        raise ValueError("source CSV is empty")
    required = {GROUP, ANIMAL, TARGET, *NUMERIC_FEATURES, *CATEGORICAL_FEATURES}
    missing = required - set(rows[0])
    if missing:
        raise ValueError(f"source CSV lacks required fields: {sorted(missing)}")
    forbidden = {TARGET, "CO2_Fin", "CH4_g_Fin", "CH4_MJ_Fin", "O2_Fin", GROUP, ANIMAL}
    if forbidden.intersection(NUMERIC_FEATURES + CATEGORICAL_FEATURES):
        raise ValueError("target, identifiers, or gas outcomes leaked into model features")
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (row[GROUP].strip(), row[ANIMAL].strip())
        if not all(key) or key in seen:
            raise ValueError(f"missing or duplicate Project+Animal key: {key}")
        seen.add(key)
        for field in [TARGET, *NUMERIC_FEATURES]:
            value = float(row[field])
            if not math.isfinite(value):
                raise ValueError(f"non-finite value in {field} for {key}")
            row[field] = value  # type: ignore[assignment]
        if not row["Breed"].strip():
            raise ValueError(f"missing Breed for {key}")
    if len({row[GROUP] for row in rows}) != 5:
        raise ValueError("protocol expects the five manifest-audited Project groups")
    return rows


def make_models() -> dict[str, object]:
    ridge_prep = ColumnTransformer(
        [
            ("numeric", StandardScaler(), NUMERIC_FEATURES),
            ("breed", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )
    forest_prep = ColumnTransformer(
        [
            ("numeric", "passthrough", NUMERIC_FEATURES),
            ("breed", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ]
    )
    return {
        "ridge": make_pipeline(ridge_prep, Ridge(alpha=1.0)),
        "randomForest": make_pipeline(
            forest_prep,
            RandomForestRegressor(
                n_estimators=300,
                min_samples_leaf=3,
                max_features=1.0,
                random_state=SEED,
                n_jobs=1,
            ),
        ),
    }


def main() -> None:
    protocol = json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))
    rows = load_rows()
    models = make_models()
    all_predictions: dict[str, list[dict[str, object]]] = defaultdict(list)
    fold_summaries: dict[str, dict[str, dict[str, object]]] = defaultdict(dict)

    projects = sorted({row[GROUP] for row in rows})
    for held_out in projects:
        train = [row for row in rows if row[GROUP] != held_out]
        test = [row for row in rows if row[GROUP] == held_out]
        train_animals = {(r[GROUP], r[ANIMAL]) for r in train}
        test_animals = {(r[GROUP], r[ANIMAL]) for r in test}
        if {r[GROUP] for r in train} & {r[GROUP] for r in test}:
            raise AssertionError("trial leakage across a grouped fold")
        if train_animals & test_animals:
            raise AssertionError("animal leakage across a grouped fold")
        y_train = [float(row[TARGET]) for row in train]
        observed = [float(row[TARGET]) for row in test]
        fold_predictions: dict[str, list[float]] = {
            "meanBaseline": [float(np.mean(y_train))] * len(test)
        }
        model_features = NUMERIC_FEATURES + CATEGORICAL_FEATURES
        X_train = pd.DataFrame([{key: row[key] for key in model_features} for row in train])
        X_test = pd.DataFrame([{key: row[key] for key in model_features} for row in test])
        for name, model in models.items():
            model.fit(X_train, y_train)
            fold_predictions[name] = [float(value) for value in model.predict(X_test)]
        for model_name, predicted in fold_predictions.items():
            if len(predicted) != len(test) or not all(math.isfinite(value) for value in predicted):
                raise ValueError(f"invalid predictions from {model_name} in {held_out}")
            fold_summaries[model_name][held_out] = {
                "n": len(test),
                **metrics(observed, predicted),
            }
            for row, estimate, actual in zip(test, predicted, observed):
                all_predictions[model_name].append({
                    "project": row[GROUP],
                    "animalId": row[ANIMAL],
                    "observedDmiKgDmPerAnimalDay": actual,
                    "predictedDmiKgDmPerAnimalDay": estimate,
                })

    model_results: dict[str, object] = {}
    for model_name, predictions in all_predictions.items():
        model_results[model_name] = {
            "pooledOutOfFold": {
                "n": len(predictions),
                **metrics(
                    [float(row["observedDmiKgDmPerAnimalDay"]) for row in predictions],
                    [float(row["predictedDmiKgDmPerAnimalDay"]) for row in predictions],
                ),
            },
            "byHeldOutProject": fold_summaries[model_name],
            "predictions": predictions,
        }

    audit = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    output = {
        "schemaVersion": "1.0.0",
        "generatedOn": date.today().isoformat(),
        "classification": "separate_population_exploratory_component_experiment",
        "targetGate109": "NO_GO_UNCHANGED",
        "issue110OriginalTarget": "not_run_gate_not_met",
        "protocol": str(PROTOCOL_PATH.relative_to(ROOT)),
        "protocolSha256": sha256(PROTOCOL_PATH),
        "source": {
            "doi": protocol["source"]["doi"],
            "file": str(SOURCE_PATH.relative_to(ROOT)),
            "sha256": sha256(SOURCE_PATH),
            "license": protocol["source"]["license"],
            "rowCount": len(rows),
            "experimentCount": len(projects),
            "auditSha256": sha256(AUDIT_PATH),
            "auditRows": audit["coverage"]["nRows"],
        },
        "estimand": protocol["estimand"],
        "featureColumns": NUMERIC_FEATURES + CATEGORICAL_FEATURES,
        "excludedFeatureColumns": protocol["excludedFeatures"],
        "split": {
            "method": "leave-one-Project-out",
            "heldOutProjects": projects,
            "rowCountsByProject": {
                project: sum(1 for row in rows if row[GROUP] == project) for project in projects
            },
            "animalKey": [GROUP, ANIMAL],
            "groupKey": GROUP,
        },
        "models": model_results,
        "limitations": protocol["evaluation"]["limits"],
        "intervals": {"reported": False, "reason": "No independent interval calibration data in this source."},
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({name: value["pooledOutOfFold"] for name, value in model_results.items()}, indent=2))
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
