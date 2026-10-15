"""Evaluate frozen Perea baselines on development animals only."""

from __future__ import annotations

import hashlib
import json
import platform
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_time_series import read_canonical_rows
from scripts.science.behavior.perea_sequence_baselines import (
    CLASSES, REPLICATES, animal_split, derive_seed, extract_windows,
    fit_baselines, fit_semimarkov, generate, generate_semimarkov,
)

DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
OUTPUT = ROOT / "docs/evidence/perea-generative-baselines-v1.json"
PROTOCOL = ROOT / "specs/riose-behavioral-agents/07-baseline-preregistration-v1.md"
SEMIMARKOV_PROTOCOL = ROOT / "specs/riose-behavioral-agents/08-semimarkov-protocol-v1.md"
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


def _class_composition_errors(observed, generated_replicates):
    observed_proportions = _proportions(observed)
    generated_means = {label: _mean([_proportions(generated)[label] for generated in generated_replicates])
                       for label in CLASSES}
    return {label: abs(observed_proportions[label] - generated_means[label]) for label in CLASSES}


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


def semimarkov_development_gate(summaries: dict, supported_classes: list[str]) -> dict:
    """Apply the preregistered three-part development eligibility gate."""
    baseline_names = ("iid", "persistence", "markov")
    semi = summaries["semimarkov"]
    best_composition = min(summaries[name]["animalMacroCompositionError"] for name in baseline_names)
    transition = {
        name: (semi["animalMacroTransitionTotalVariation"] is not None
               and summaries[name]["animalMacroTransitionTotalVariation"] is not None
               and semi["animalMacroTransitionTotalVariation"] <=
               summaries[name]["animalMacroTransitionTotalVariation"] - 0.02)
        for name in ("iid", "persistence")
    }
    classwise = {
        label: semi["perClassAnimalMacroAbsoluteProportionError"][label] <=
        min(summaries[name]["perClassAnimalMacroAbsoluteProportionError"][label]
            for name in baseline_names) + 0.05
        for label in supported_classes
    }
    composition = semi["animalMacroCompositionError"] <= best_composition + 0.01
    return {
        "compositionAtMostBestBaselinePlus001": composition,
        "transitionTVAtLeast002BetterThanIIDAndPersistence": transition,
        "classwiseCompositionAtMostBestBaselinePlus005": classwise,
        "pass": composition and all(transition.values()) and all(classwise.values()),
        "confirmatoryHoldoutOpened": False,
    }


def evaluate(data_path: Path = DATA, include_semimarkov: bool = False) -> dict:
    rows, preprocessing = read_canonical_rows(data_path)
    windows = extract_windows(rows)
    animals = {window["animal"] for window in windows}
    confirmatory, folds = animal_split(animals)
    by_animal = defaultdict(list)
    for window in windows:
        by_animal[window["animal"]].append(window)
    fold_reports = []
    candidates = CANDIDATES + (("semimarkov",) if include_semimarkov else ())
    candidate_animal_scores = {candidate: defaultdict(lambda: defaultdict(list)) for candidate in candidates}
    candidate_diagnostics = {candidate: Counter() for candidate in candidates}
    observed_class_support = Counter()
    for fold_index, test_animals in enumerate(folds):
        train_animals = animals - confirmatory - test_animals
        if train_animals & test_animals or train_animals & confirmatory or test_animals & confirmatory:
            raise ValueError("Animal leakage across train, development test, or confirmatory holdout")
        training_windows = [w for animal in sorted(train_animals) for w in by_animal[animal]]
        model = fit_baselines(training_windows)
        semimarkov_model = fit_semimarkov(training_windows) if include_semimarkov else None
        supported = [state for state in CLASSES if model["transitionSupport"][state] >= 20]
        animal_records = []
        for animal in sorted(test_animals):
            for window in sorted(by_animal[animal], key=lambda item: item["index"]):
                observed = window["labels"]
                observed_class_support.update(observed)
                for candidate in candidates:
                    composition, transition, run_errors, generated_replicates = [], [], defaultdict(list), []
                    for replicate in range(REPLICATES):
                        seed = derive_seed(candidate, fold_index, animal, window["index"], replicate)
                        generated = (generate_semimarkov(semimarkov_model, len(observed), seed)
                                     if candidate == "semimarkov" else generate(candidate, model, len(observed), seed))
                        if len(generated) != len(observed) or any(label not in CLASSES for label in generated):
                            raise ValueError("Generated sequence violates frozen length/ontology contract")
                        generated_replicates.append(generated)
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
                    class_errors = _class_composition_errors(observed, generated_replicates)
                    for label, value in class_errors.items():
                        values[f"class:{label}"].append(value)
                    values["transition"].append(_mean(transition) if transition else None)
                    values["runErrors"].extend(value for class_values in run_errors.values() for value in class_values)
                    animal_records.append({
                        "candidate": candidate, "animal": animal, "windowIndex": window["index"],
                        "lengthMinutes": len(observed), "compositionError": _mean(composition),
                        "classCompositionAbsoluteError": class_errors,
                        "transitionTotalVariation": _mean(transition),
                        "transitionComparisonsPerReplicate": n_states,
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
            "semiMarkovTrainingDurationSupport": (semimarkov_model["supportedClasses"] if semimarkov_model else None),
            "semiMarkovCompleteDurationSamplesByClass": ({
                label: sum(len(values) for values in semimarkov_model["durationSamplesByAnimal"][label].values())
                for label in semimarkov_model["supportedClasses"]
            } if semimarkov_model else None),
            "perWindowPerCandidate": animal_records,
        })
    summaries = {}
    for candidate in candidates:
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
            "perClassAnimalMacroAbsoluteProportionError": {
                label: _mean([_mean(animal_scores[animal][f"class:{label}"])
                              for animal in animal_scores if animal_scores[animal].get(f"class:{label}")])
                for label in CLASSES
            },
            "diagnostics": {
                "singleClassWindowRate": diagnostic["singleClassWindows"] / diagnostic["windows"] if diagnostic["windows"] else None,
                "missingClassOccurrencesPerWindow": diagnostic["missingClassOccurrences"] / diagnostic["windows"] if diagnostic["windows"] else None,
                "switchesPerMinute": diagnostic["switches"] / diagnostic["minutes"] if diagnostic["minutes"] else None,
            },
            "perAnimal": per_animal,
        }
    semi_markov_gate = None
    if include_semimarkov:
        supported_classes = [label for label in CLASSES if observed_class_support[label] > 0]
        semi_markov_gate = semimarkov_development_gate(summaries, supported_classes)
    protocol_hash = hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
    candidate_source_path = ROOT / "scripts/science/behavior/perea_sequence_baselines.py"
    evaluator_source_path = Path(__file__).resolve()
    return {
        "schemaVersion": "perea-generative-sequences.v1" if include_semimarkov else "perea-generative-baselines.v1",
        "studyType": "within_source_grouped_by_animal_exploratory_baseline_comparison",
        "candidate": ({"id": "perea-semi-markov-experimental", "version": "1.0.0", "status": "research_only"} if include_semimarkov else {"id": "perea-simple-sequence-baselines", "version": "1.0.0", "status": "diagnostic_only"}),
        "execution": {
            "pythonVersion": platform.python_version(),
            "randomImplementation": "Python random.Random with SHA-256-derived per-candidate/fold/animal/window/replicate seed",
            "candidateImplementationSha256": hashlib.sha256(candidate_source_path.read_bytes()).hexdigest(),
            "evaluatorImplementationSha256": hashlib.sha256(evaluator_source_path.read_bytes()).hexdigest(),
            "sequenceSchemaSha256": hashlib.sha256((ROOT / "schemas/perea-behavior-sequence-v1.schema.json").read_bytes()).hexdigest(),
        },
        "source": {"file": data_path.resolve().relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(data_path.read_bytes()).hexdigest(), "preprocessing": preprocessing},
        "protocol": {"file": PROTOCOL.relative_to(ROOT).as_posix(), "sha256": protocol_hash, "version": "1", "replicatesPerWindow": REPLICATES},
        "candidateProtocol": ({"file": SEMIMARKOV_PROTOCOL.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(SEMIMARKOV_PROTOCOL.read_bytes()).hexdigest(), "version": "1"} if include_semimarkov else None),
        "holdoutPolicy": {"reservedConfirmatoryAnimals": sorted(confirmatory), "confirmatoryScoresComputed": False},
        "development": {"folds": fold_reports, "candidateSummaries": summaries, "semiMarkovGate": semi_markov_gate},
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
