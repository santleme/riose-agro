"""Deterministic training-only Perea behavior sequence baselines."""

from __future__ import annotations

import hashlib
import random
from collections import Counter, defaultdict
from datetime import timedelta

CLASSES = ("GR", "RE", "RU", "WA")
SPLIT_SEED = 20261015
SEED_NAMESPACE = "perea-baseline-v1|20261015"
REPLICATES = 20
CONFIRMATORY_ANIMALS = ("AH:2008", "BH:5111", "BR:8065", "RC:35")
DEVELOPMENT_FOLDS = (
    ("AH:2003", "BH:4589", "BR:8063", "RC:6"),
    ("AH:2013", "BH:4511", "BR:7001", "RC:2061"),
    ("AH:2009", "BH:4085", "BR:8089", "RC:2024"),
    ("AH:2019", "BH:6495", "BR:8073", "RC:1067"),
    ("AH:2004", "BH:4071", "BR:8071", "RC:9012"),
)


def animal_split(group_ids: set[str]) -> tuple[set[str], list[set[str]]]:
    """Return the frozen reserved holdout and five balanced development folds."""
    by_breed: dict[str, list[str]] = defaultdict(list)
    for group_id in sorted(group_ids):
        breed, _ = group_id.split(":", 1)
        by_breed[breed].append(group_id)
    if len(by_breed) != 4 or any(len(items) != 6 for items in by_breed.values()):
        raise ValueError("Protocol v1 requires six animals in each of four breeds")
    rng = random.Random(SPLIT_SEED)
    confirmatory, dev_by_breed = [], {}
    for breed in sorted(by_breed):
        groups = sorted(by_breed[breed])
        rng.shuffle(groups)
        confirmatory.append(groups[0])
        dev_by_breed[breed] = groups[1:]
    folds = [set() for _ in range(5)]
    for breed in sorted(dev_by_breed):
        for fold, group_id in enumerate(dev_by_breed[breed]):
            folds[fold].add(group_id)
    reserved = set(confirmatory)
    if tuple(sorted(reserved)) != CONFIRMATORY_ANIMALS:
        raise ValueError("Perea animal roster differs from frozen protocol v1")
    if tuple(tuple(sorted(fold)) for fold in folds) != DEVELOPMENT_FOLDS:
        raise ValueError("Perea development partitions differ from frozen protocol v1")
    return reserved, folds


def extract_windows(rows: list[dict]) -> list[dict]:
    """Split canonical observations at any non-exact one-minute gap."""
    by_animal: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_animal[row["group_id"]].append(row)
    windows = []
    for group_id, animal_rows in sorted(by_animal.items()):
        current = []
        local_index = 0
        for row in animal_rows:
            if current and row["timestamp"] - current[-1]["timestamp"] != timedelta(minutes=1):
                windows.append(_window(group_id, current, local_index))
                local_index += 1
                current = []
            current.append(row)
        if current:
            windows.append(_window(group_id, current, local_index))
    return windows


def _window(group_id: str, rows: list[dict], index: int) -> dict:
    return {"animal": group_id, "index": index, "labels": [row["behavior"] for row in rows]}


def fit_baselines(training_windows: list[dict]) -> dict:
    """Fit only training-derived animal-balanced marginal/transition priors."""
    by_animal: dict[str, list[list[str]]] = defaultdict(list)
    for window in training_windows:
        by_animal[window["animal"]].append(window["labels"])
    if not by_animal:
        raise ValueError("At least one training animal is required")
    animal_priors, per_animal_transitions = [], {}
    pooled_transition_counts = Counter()
    for animal, sequences in sorted(by_animal.items()):
        label_counts = Counter(label for sequence in sequences for label in sequence)
        total_labels = sum(label_counts.values())
        animal_priors.append({label: label_counts[label] / total_labels for label in CLASSES})
        counts = Counter()
        for sequence in sequences:
            counts.update(zip(sequence, sequence[1:]))
        per_animal_transitions[animal] = counts
        pooled_transition_counts.update(counts)
    prior = {label: sum(p[label] for p in animal_priors) / len(animal_priors) for label in CLASSES}
    rows = {}
    support = {}
    for source in CLASSES:
        animal_rows = []
        for counts in per_animal_transitions.values():
            row_total = sum(counts[(source, target)] for target in CLASSES)
            if row_total:
                animal_rows.append({target: counts[(source, target)] / row_total for target in CLASSES})
        if not animal_rows:
            rows[source] = prior.copy()
        else:
            mean_row = {target: sum(row[target] for row in animal_rows) / len(animal_rows) for target in CLASSES}
            denominator = 1.0 + 0.5 * len(CLASSES)
            rows[source] = {target: (mean_row[target] + 0.5) / denominator for target in CLASSES}
        support[source] = sum(pooled_transition_counts[(source, target)] for target in CLASSES)
    return {"prior": prior, "markovRows": rows, "transitionSupport": support,
            "trainingAnimals": sorted(by_animal), "trainingWindows": len(training_windows)}


def derive_seed(candidate: str, fold: int, animal: str, window_index: int, replicate: int) -> int:
    value = f"{SEED_NAMESPACE}|{candidate}|{fold}|{animal}|{window_index}|{replicate}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(value).digest()[:8], "big")


def generate(candidate: str, model: dict, length: int, seed: int) -> list[str]:
    """Generate a label sequence from training parameters and target length only."""
    if candidate not in {"iid", "persistence", "markov"}:
        raise ValueError(f"Unsupported baseline: {candidate}")
    if length < 0:
        raise ValueError("Sequence length cannot be negative")
    rng = random.Random(seed)
    if length == 0:
        return []
    first = _draw(model["prior"], rng)
    if candidate == "persistence":
        return [first] * length
    result = [first]
    for _ in range(1, length):
        probabilities = model["prior"] if candidate == "iid" else model["markovRows"][result[-1]]
        result.append(_draw(probabilities, rng))
    return result


def _draw(probabilities: dict[str, float], rng: random.Random) -> str:
    threshold = rng.random()
    total = 0.0
    for label in CLASSES:
        total += probabilities[label]
        if threshold < total:
            return label
    return CLASSES[-1]
