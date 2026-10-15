"""Evaluate frozen Perea baselines on development animals only."""

from __future__ import annotations

import hashlib
import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_time_series import read_canonical_rows
from scripts.science.behavior.perea_sequence_baselines import (
    CLASSES, REPLICATES, animal_split, derive_seed, extract_windows,
    fit_baselines, generate,
)

DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
OUTPUT = ROOT / "docs/evidence/perea-generative-baselines-v1.json"
PROTOCOL = ROOT / "specs/riose-behavioral-agents/07-baseline-preregistration-v1.md"
CANDIDATES = ("iid", "persistence", "markov")


def _mean(values):
    return statistics.fmean(values) if values else None


def _proportions(sequence):
    counts = Counter(sequence)
    length = len(sequence)
    return {label: counts[label] / length for label in CLASSES} if length else {label: 0 for label in CLASSES}


def _composition_error(observed, generated):
    left, right = _proportions(observed), _proportions(generated)
    return statistics.fmean(abs(left[label] - right[label]) for label in CLASSES)


def _transition_rows(sequence):
    counts = defaultdict(Counter)
    for source, target in zip(sequence, sequence[1:]):
        counts[source][target] += 1
    rows = {}
    for source, row in counts.items():
        total = sum(row.values())
        rows[source] = {label: row[label] / total for label in CLASSES}
    return rows, counts


def _transition_tv(observed, generated, supported):
    actual, _ = _transition_rows(observed)
    predicted, _ = _transition_rows(generated)
    distances = []
    for source in supported:
        if source not in actual:
            continue
        # A candidate that emits no transition row for an observed state has
        # failed to cover that conditional distribution; score maximum TV.
        distances.append(1.0 if source not in predicted else 0.5 * sum(
            abs(actual[source].get(label, 0) - predicted[source].get(label, 0)) for label in CLASSES
        ))
    return _mean(distances), len(distances)


def _complete_runs(sequence):
    runs = []
    start = 0
    for index in range(1, len(sequence) + 1):
        if index == len(sequence) or sequence[index] != sequence[start]:
            if start > 0 and index < len(sequence):
                runs.append((sequence[start], index - start))
            start = index
    return runs


def _complete_run_median(sequence, label):
    durations = [duration for state, duration in _complete_runs(sequence) if state == label]
    return statistics.median(durations) if durations else None


def evaluate(data_path: Path = DATA) -> dict:
    rows, preprocessing = read_canonical_rows(data_path)
    windows = extract_windows(rows)
    animals = {window["animal"] for window in windows}
    confirmatory, folds = animal_split(animals)
    by_animal = defaultdict(list)
    for window in windows:
        by_animal[window["animal"]].append(window)
    fold_reports = []
    candidate_animal_scores = {candidate: defaultdict(lambda: defaultdict(list)) for candidate in CANDIDATES}
    candidate_diagnostics = {candidate: Counter() for candidate in CANDIDATES}
    for fold_index, test_animals in enumerate(folds):
        train_animals = animals - confirmatory - test_animals
        if train_animals & test_animals or train_animals & confirmatory or test_animals & confirmatory:
            raise ValueError("Animal leakage across train, development test, or confirmatory holdout")
        training_windows = [w for animal in sorted(train_animals) for w in by_animal[animal]]
        model = fit_baselines(training_windows)
        supported = [state for state in CLASSES if model["transitionSupport"][state] >= 20]
        animal_records = []
        for animal in sorted(test_animals):
            for window in sorted(by_animal[animal], key=lambda item: item["index"]):
                observed = window["labels"]
                for candidate in CANDIDATES:
                    composition, transition, run_errors = [], [], defaultdict(list)
                    for replicate in range(REPLICATES):
                        seed = derive_seed(candidate, fold_index, animal, window["index"], replicate)
                        generated = generate(candidate, model, len(observed), seed)
                        if len(generated) != len(observed) or any(label not in CLASSES for label in generated):
                            raise ValueError("Generated sequence violates frozen length/ontology contract")
                        composition.append(_composition_error(observed, generated))
                        tv, n_states = _transition_tv(observed, generated, supported)
                        if tv is not None:
                            transition.append(tv)
                        for label in CLASSES:
                            actual_median = _complete_run_median(observed, label)
                            generated_median = _complete_run_median(generated, label)
                            if actual_median is not None and generated_median is not None:
                                run_errors[label].append(abs(actual_median - generated_median))
                        counts = Counter(generated)
                        candidate_diagnostics[candidate]["windows"] += 1
                        candidate_diagnostics[candidate]["singleClassWindows"] += int(len(counts) == 1)
                        candidate_diagnostics[candidate]["missingClassOccurrences"] += len(CLASSES) - len(counts)
                        candidate_diagnostics[candidate]["switches"] += sum(a != b for a, b in zip(generated, generated[1:]))
                        candidate_diagnostics[candidate]["minutes"] += len(generated)
                    values = candidate_animal_scores[candidate][animal]
                    values["composition"].append(_mean(composition))
                    values["transition"].append(_mean(transition) if transition else None)
                    values["runErrors"].extend(value for class_values in run_errors.values() for value in class_values)
                    animal_records.append({
                        "candidate": candidate, "animal": animal, "windowIndex": window["index"],
                        "lengthMinutes": len(observed), "compositionError": _mean(composition),
                        "transitionTotalVariation": _mean(transition),
                        "transitionComparisonsPerReplicate": n_states if 'n_states' in locals() else 0,
                        "completeRunAbsoluteMedianErrorMinutes": {
                            label: _mean(run_errors[label]) for label in CLASSES if run_errors[label]
                        },
                    })
        fold_reports.append({
            "fold": fold_index,
            "trainAnimals": sorted(train_animals), "testAnimals": sorted(test_animals),
            "trainWindowCount": len(training_windows),
            "testWindowCount": sum(len(by_animal[a]) for a in test_animals),
            "transitionStatesSupportedAt20TrainingTransitions": supported,
            "perWindowPerCandidate": animal_records,
        })
    summaries = {}
    for candidate in CANDIDATES:
        animal_scores = candidate_animal_scores[candidate]
        per_animal = {}
        for animal in sorted(animal_scores):
            vals = animal_scores[animal]
            per_animal[animal] = {
                "compositionError": _mean(vals["composition"]),
                "transitionTotalVariation": _mean([x for x in vals["transition"] if x is not None]),
                "completeRunAbsoluteMedianErrorMinutes": _mean(vals["runErrors"]),
                "scoredWindows": len(vals["composition"]),
            }
        diagnostic = candidate_diagnostics[candidate]
        summaries[candidate] = {
            "animalMacroCompositionError": _mean([row["compositionError"] for row in per_animal.values()]),
            "animalMacroTransitionTotalVariation": _mean([row["transitionTotalVariation"] for row in per_animal.values() if row["transitionTotalVariation"] is not None]),
            "animalMacroCompleteRunAbsoluteMedianErrorMinutes": _mean([row["completeRunAbsoluteMedianErrorMinutes"] for row in per_animal.values() if row["completeRunAbsoluteMedianErrorMinutes"] is not None]),
            "diagnostics": {
                "singleClassWindowRate": diagnostic["singleClassWindows"] / diagnostic["windows"] if diagnostic["windows"] else None,
                "missingClassOccurrencesPerWindow": diagnostic["missingClassOccurrences"] / diagnostic["windows"] if diagnostic["windows"] else None,
                "switchesPerMinute": diagnostic["switches"] / diagnostic["minutes"] if diagnostic["minutes"] else None,
            },
            "perAnimal": per_animal,
        }
    protocol_hash = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
    return {
        "schemaVersion": "perea-generative-baselines.v1",
        "studyType": "within_source_grouped_by_animal_exploratory_baseline_comparison",
        "source": {"file": data_path.resolve().relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(), "preprocessing": preprocessing},
        "protocol": {"file": PROTOCOL.relative_to(ROOT).as_posix(), "sha256": protocol_hash, "version": "1", "replicatesPerWindow": REPLICATES},
        "holdoutPolicy": {"reservedConfirmatoryAnimals": sorted(confirmatory), "confirmatoryScoresComputed": False},
        "development": {"folds": fold_reports, "candidateSummaries": summaries},
        "interpretation": [
            "All reported scores are development-fold descriptive metrics over animals from the Perea source; they are not external validation.",
            "Synthetic replicates are not independent animals. Macro summaries weight each held-out animal equally.",
            "Annotated label-run lengths may be biased by the source's carry-forward rule and are not unbiased biological bout durations.",
            "No score enables a behavior model or changes FarmEngine defaults.",
        ],
    }


def main() -> None:
    report = evaluate()
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(report['development']['folds'])} development folds; "
          "confirmatory holdout scores not computed")


if __name__ == "__main__":
    main()
