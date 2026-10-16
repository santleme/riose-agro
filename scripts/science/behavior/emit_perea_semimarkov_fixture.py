#!/usr/bin/env python3
"""Emit one training-fold-only sequence for JSON Schema integration testing."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_time_series import read_canonical_rows
from scripts.science.behavior.perea_sequence_baselines import (
    animal_split, derive_seed, extract_windows, fit_semimarkov,
    generate_semimarkov, serialize_semimarkov_sequence,
)


def main():
    rows, _ = read_canonical_rows(ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv")
    windows = extract_windows(rows)
    animals = {window["animal"] for window in windows}
    _, folds = animal_split(animals)
    test_animals = folds[0]
    # Fold 0 training is every development animal outside its test fold; the
    # confirmatory four are removed explicitly and never used as sequence input.
    train_animals = animals - test_animals - {"AH:2008", "BH:5111", "BR:8065", "RC:35"}
    training = [window for window in windows if window["animal"] in train_animals]
    model = fit_semimarkov(training)
    seed = derive_seed("semimarkov", 0, sorted(test_animals)[0], 0, 0)
    sequence = generate_semimarkov(model, 24, seed)
    print(json.dumps(serialize_semimarkov_sequence(sequence, model, seed, 0, 0, 0), ensure_ascii=False))


if __name__ == "__main__":
    main()
