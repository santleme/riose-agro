#!/usr/bin/env python3
"""One frozen internal confirmatory run on four reserved Perea animals."""

from __future__ import annotations

import hashlib
import json
import platform
import resource
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_sequence_baselines import (
    CLASSES, REPLICATES, animal_split, derive_seed, extract_windows,
    fit_baselines, fit_semimarkov, generate, generate_semimarkov,
)
from scripts.science.behavior.perea_time_series import read_canonical_rows
from scripts.science.behavior.evaluate_perea_sequence_baselines import (
    _class_composition_errors, _complete_run_median, _composition_error,
    _mean, _transition_tv,
)

DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
PROTOCOL = ROOT / "specs/riose-behavioral-agents/09-confirmatory-protocol-v1.md"
OUTPUT = ROOT / "docs/evidence/perea-confirmatory-v1.json"
RESOURCE_OUTPUT = ROOT / "docs/evidence/perea-confirmatory-execution-metadata.json"
OUTPUT_SCHEMA = ROOT / "schemas/perea-behavior-sequence-v1.schema.json"
MODEL_SOURCE = ROOT / "scripts/science/behavior/perea_sequence_baselines.py"
EVALUATOR_SOURCE = Path(__file__).resolve()
BASELINE_EVALUATOR = ROOT / "scripts/science/behavior/evaluate_perea_sequence_baselines.py"
RESERVED = {"AH:2008", "BH:5111", "BR:8065", "RC:35"}
CANDIDATES = ("iid", "persistence", "markov", "semimarkov")


def confirmatory_partition(all_animals: set[str]) -> tuple[set[str], set[str]]:
    reserved, _ = animal_split(all_animals)
    if reserved != RESERVED:
        raise ValueError("Reserved animal identities differ from frozen protocol")
    training = all_animals - reserved
    if len(training) != 20 or training & reserved:
        raise ValueError("Confirmatory partition must contain 20 train and 4 held-out animals")
    return training, reserved


def _sequence_model(candidate: str, training_windows: list[dict]):
    if candidate == "semimarkov":
        return fit_semimarkov(training_windows)
    return fit_baselines(training_windows)


def _generate(candidate: str, model: dict, length: int, seed: int) -> list[str]:
    if candidate == "semimarkov":
        return generate_semimarkov(model, length, seed)
    return generate(candidate, model, length, seed)


def evaluate() -> dict:
    rows, preprocessing = read_canonical_rows(DATA)
    windows = extract_windows(rows)
    animals = {window["animal"] for window in windows}
    train_animals, test_animals = confirmatory_partition(animals)
    by_animal = defaultdict(list)
    for window in windows:
        by_animal[window["animal"]].append(window)
    training_windows = [window for animal in sorted(train_animals) for window in by_animal[animal]]
    baseline_model = fit_baselines(training_windows)
    semi_model = fit_semimarkov(training_windows)
    transition_supported = [state for state in CLASSES if baseline_model["transitionSupport"][state] >= 20]
    class_support = Counter(label for animal in test_animals for window in by_animal[animal] for label in window["labels"])
    all_scores = {}
    for candidate in CANDIDATES:
        per_animal = {}
        for animal in sorted(test_animals):
            windows_scores = []
            diagnostic_counts = Counter()
            for window in sorted(by_animal[animal], key=lambda item: item["index"]):
                observed = window["labels"]
                compositions, transition_tvs = [], []
                run_errors, generated_replicates = defaultdict(list), []
                for replicate in range(REPLICATES):
                    seed = derive_seed(candidate, 5, animal, window["index"], replicate)
                    model = semi_model if candidate == "semimarkov" else baseline_model
                    generated = _generate(candidate, model, len(observed), seed)
                    if len(generated) != len(observed) or any(label not in CLASSES for label in generated):
                        raise ValueError("Generated confirmatory sequence violates length/ontology contract")
                    generated_replicates.append(generated)
                    compositions.append(_composition_error(observed, generated))
                    tv, _ = _transition_tv(observed, generated, transition_supported)
                    if tv is not None:
                        transition_tvs.append(tv)
                    for label in CLASSES:
                        actual_median = _complete_run_median(observed, label)
                        generated_median = _complete_run_median(generated, label)
                        if actual_median is not None and generated_median is not None:
                            run_errors[label].append(abs(actual_median - generated_median))
                    state_counts = Counter(generated)
                    diagnostic_counts["replicateWindows"] += 1
                    diagnostic_counts["singleClassWindows"] += int(len(state_counts) == 1)
                    diagnostic_counts["missingClassOccurrences"] += len(CLASSES) - len(state_counts)
                    diagnostic_counts["switches"] += sum(a != b for a, b in zip(generated, generated[1:]))
                    diagnostic_counts["minutes"] += len(generated)
                windows_scores.append({
                    "compositionError": _mean(compositions),
                    "transitionTotalVariation": _mean(transition_tvs),
                    "perClassAbsoluteProportionError": _class_composition_errors(observed, generated_replicates),
                    "completeRunAbsoluteMedianErrorMinutes": {
                        label: _mean(run_errors[label]) for label in CLASSES if run_errors[label]
                    },
                })
            per_animal[animal] = {
                "windowCount": len(windows_scores),
                "compositionError": _mean([score["compositionError"] for score in windows_scores]),
                "transitionTotalVariation": _mean([score["transitionTotalVariation"] for score in windows_scores if score["transitionTotalVariation"] is not None]),
                "perClassAbsoluteProportionError": {
                    label: _mean([score["perClassAbsoluteProportionError"][label] for score in windows_scores])
                    for label in CLASSES
                },
                "completeRunAbsoluteMedianErrorMinutes": {
                    label: _mean([score["completeRunAbsoluteMedianErrorMinutes"][label]
                                  for score in windows_scores if label in score["completeRunAbsoluteMedianErrorMinutes"]])
                    for label in CLASSES
                },
                "diagnostics": {
                    "singleClassReplicateWindowRate": diagnostic_counts["singleClassWindows"] / diagnostic_counts["replicateWindows"] if diagnostic_counts["replicateWindows"] else None,
                    "missingClassOccurrencesPerReplicateWindow": diagnostic_counts["missingClassOccurrences"] / diagnostic_counts["replicateWindows"] if diagnostic_counts["replicateWindows"] else None,
                    "switchesPerMinute": diagnostic_counts["switches"] / diagnostic_counts["minutes"] if diagnostic_counts["minutes"] else None,
                },
            }
        all_scores[candidate] = per_animal

    summaries = {}
    for candidate, per_animal in all_scores.items():
        summaries[candidate] = {
            "animalMacroCompositionError": _mean([row["compositionError"] for row in per_animal.values()]),
            "animalMacroTransitionTotalVariation": _mean([row["transitionTotalVariation"] for row in per_animal.values() if row["transitionTotalVariation"] is not None]),
            "perClassAnimalMacroAbsoluteProportionError": {
                label: _mean([row["perClassAbsoluteProportionError"][label] for row in per_animal.values()])
                for label in CLASSES
            },
            "animalMacroCompleteRunAbsoluteMedianErrorMinutes": {
                label: _mean([row["completeRunAbsoluteMedianErrorMinutes"][label] for row in per_animal.values()
                              if row["completeRunAbsoluteMedianErrorMinutes"][label] is not None])
                for label in CLASSES
            },
            "perAnimal": per_animal,
        }
    semi = summaries["semimarkov"]
    best_composition = min(summaries[candidate]["animalMacroCompositionError"] for candidate in CANDIDATES[:3])
    transition_pass = {
        candidate: semi["animalMacroTransitionTotalVariation"] <= summaries[candidate]["animalMacroTransitionTotalVariation"] - 0.02
        for candidate in ("iid", "persistence")
    }
    class_pass = {
        label: semi["perClassAnimalMacroAbsoluteProportionError"][label] <=
        min(summaries[candidate]["perClassAnimalMacroAbsoluteProportionError"][label] for candidate in CANDIDATES[:3]) + 0.05
        for label in CLASSES if class_support[label] > 0
    }
    composition_pass = semi["animalMacroCompositionError"] <= best_composition + 0.01
    gate_pass = composition_pass and all(transition_pass.values()) and all(class_pass.values())
    return {
        "schemaVersion": "perea-generative-confirmatory.v1",
        "studyType": "within_source_reserved_animal_confirmatory_comparison",
        "candidate": {"id": "perea-semi-markov-experimental", "version": "1.0.0", "status": "research_only"},
        "source": {"file": DATA.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(DATA.read_bytes()).hexdigest(), "preprocessing": preprocessing},
        "protocol": {"file": PROTOCOL.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(PROTOCOL.read_bytes()).hexdigest(), "version": "1"},
        "implementation": {
            "candidateFile": MODEL_SOURCE.relative_to(ROOT).as_posix(), "candidateSha256": hashlib.sha256(MODEL_SOURCE.read_bytes()).hexdigest(),
            "evaluatorFile": EVALUATOR_SOURCE.relative_to(ROOT).as_posix(), "evaluatorSha256": hashlib.sha256(EVALUATOR_SOURCE.read_bytes()).hexdigest(),
            "baselineEvaluatorSha256": hashlib.sha256(BASELINE_EVALUATOR.read_bytes()).hexdigest(),
            "outputSchemaSha256": hashlib.sha256(OUTPUT_SCHEMA.read_bytes()).hexdigest(),
        },
        "execution": {"pythonVersion": platform.python_version(), "replicatesPerWindow": REPLICATES,
                      "seedSchedule": "BEH-002 SHA-256 schedule; fold id 5; no held-out labels or MI passed to generator"},
        "partition": {"trainingAnimalIds": sorted(train_animals), "confirmatoryAnimalIds": sorted(test_animals),
                       "trainingAnimals": len(train_animals), "confirmatoryAnimals": len(test_animals),
                       "trainingWindows": len(training_windows),
                       "confirmatoryWindows": sum(len(by_animal[animal]) for animal in test_animals)},
        "support": {"observedConfirmatoryClassMinutes": {label: class_support[label] for label in CLASSES},
                    "trainingDurationClasses": semi_model["supportedClasses"],
                    "trainingCompleteDurationSamplesByClass": {label: sum(len(v) for v in semi_model["durationSamplesByAnimal"][label].values()) for label in semi_model["supportedClasses"]},
                    "transitionStatesSupportedAt20TrainingTransitions": transition_supported},
        "metrics": summaries,
        "gate": {
            "compositionAtMostBestSimpleBaselinePlus001": composition_pass,
            "transitionTVAtLeast002BetterThanIIDAndPersistence": transition_pass,
            "classwiseCompositionAtMostBestBaselinePlus005": class_pass,
            "pass": gate_pass,
            "decision": "eligible_for_independent_review_only" if gate_pass else "NO_GO_FOR_THIS_CANDIDATE_AND_SOURCE",
            "modelPromoted": False,
            "productionEnabled": False,
            "externalValidationEstablished": False,
        },
        "limitations": [
            "Four reserved animals from the same Perea source are an internal animal holdout, not independent external-site validation.",
            "Source labels can carry forward events shorter than 30 seconds; durations describe annotations, not unbiased biological bouts.",
            "No physiological, nutritional, weight, intake, or FarmEngine result is modeled or inferred.",
            "Four confirmatory animals do not support confidence intervals or broad population claims.",
        ],
    }


def _rss_bytes(value: int) -> int:
    # getrusage is bytes on macOS and KiB on Linux/BSD.
    return value if platform.system() == "Darwin" else value * 1024


def main() -> None:
    start = time.perf_counter()
    initial_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    report = evaluate()
    elapsed = time.perf_counter() - start
    peak_rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    resource_report = {
        "schemaVersion": "perea-confirmatory-execution-metadata.v1",
        "evaluatorSha256": report["implementation"]["evaluatorSha256"],
        "pythonVersion": platform.python_version(), "platform": platform.platform(),
        "wallTimeSeconds": elapsed,
        "peakRssBytes": _rss_bytes(peak_rss),
        "initialProcessPeakRssBytes": _rss_bytes(initial_rss),
        "note": "Environment resource measurements are descriptive execution metadata, not scientific metrics.",
    }
    RESOURCE_OUTPUT.write_text(json.dumps(resource_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: gate={report['gate']['pass']}; modelPromoted=false")


if __name__ == "__main__":
    main()
