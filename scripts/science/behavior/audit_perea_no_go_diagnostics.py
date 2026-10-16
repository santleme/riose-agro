#!/usr/bin/env python3
"""Reproduce frozen Perea sequences for bounded post-NO-GO diagnostics."""

from __future__ import annotations

import hashlib
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from scripts.science.behavior.perea_sequence_baselines import (  # noqa: E402
    CLASSES, REPLICATES, animal_split, derive_seed, extract_windows,
    fit_baselines, fit_semimarkov, generate, generate_semimarkov,
)
from scripts.science.behavior.perea_time_series import read_canonical_rows  # noqa: E402

DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
RESULT = ROOT / "docs/evidence/perea-confirmatory-v1.json"
READINESS = ROOT / "docs/evidence/perea-time-series-readiness.json"
PROTOCOL = ROOT / "specs/riose-behavioral-agents/09-confirmatory-protocol-v1.md"
DIAGNOSTIC_PROTOCOL = ROOT / "specs/riose-behavioral-agents/11-post-nogo-diagnostic-protocol-v1.md"
MODEL_SOURCE = ROOT / "scripts/science/behavior/perea_sequence_baselines.py"
EVALUATOR = ROOT / "scripts/science/behavior/evaluate_perea_confirmatory.py"
OUTPUT_JSON = ROOT / "docs/evidence/perea-no-go-diagnostic-v1.json"
OUTPUT_MD = ROOT / "docs/evidence/perea-no-go-diagnostic-v1.md"
ANIMALS = {"AH:2008", "BH:5111", "BR:8065", "RC:35"}
CANDIDATES = ("iid", "persistence", "markov", "semimarkov")
LENGTH_BINS = ((1, 1, "1"), (2, 2, "2"), (3, 5, "3-5"), (6, 15, "6-15"), (16, 10**9, "16+"))


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _runs(labels: list[str]) -> list[tuple[str, int]]:
    result: list[tuple[str, int]] = []
    start = 0
    for index in range(1, len(labels) + 1):
        if index == len(labels) or labels[index] != labels[start]:
            if start > 0 and index < len(labels):
                result.append((labels[start], index - start))
            start = index
    return result


def _quantile(values: list[int], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _distribution(values: list[int]) -> dict:
    return {
        "completeInteriorRuns": len(values),
        "q25Minutes": _quantile(values, 0.25),
        "medianMinutes": statistics.median(values) if values else None,
        "q75Minutes": _quantile(values, 0.75),
    }


def _length_bin(length: int) -> str:
    for lower, upper, name in LENGTH_BINS:
        if lower <= length <= upper:
            return name
    raise ValueError(f"No length bin for window of {length} minutes")


def _gate_diagnostics(result: dict) -> dict:
    metrics = result["metrics"]
    semi = metrics["semimarkov"]
    simple = ("iid", "persistence", "markov")
    best_composition = min(metrics[name]["animalMacroCompositionError"] for name in simple)
    best_ru = min(metrics[name]["perClassAnimalMacroAbsoluteProportionError"]["RU"] for name in simple)
    return {
        "composition": {
            "candidate": semi["animalMacroCompositionError"],
            "bestSimpleBaseline": best_composition,
            "allowedMaximum": best_composition + 0.01,
            "excessOverAllowed": semi["animalMacroCompositionError"] - (best_composition + 0.01),
            "passed": result["gate"]["compositionAtMostBestSimpleBaselinePlus001"],
        },
        "transitionTV": {
            "candidate": semi["animalMacroTransitionTotalVariation"],
            "iid": metrics["iid"]["animalMacroTransitionTotalVariation"],
            "persistence": metrics["persistence"]["animalMacroTransitionTotalVariation"],
            "improvementVsIid": metrics["iid"]["animalMacroTransitionTotalVariation"] - semi["animalMacroTransitionTotalVariation"],
            "improvementVsPersistence": metrics["persistence"]["animalMacroTransitionTotalVariation"] - semi["animalMacroTransitionTotalVariation"],
            "requiredImprovement": 0.02,
            "passed": result["gate"]["transitionTVAtLeast002BetterThanIIDAndPersistence"],
        },
        "rareClassRU": {
            "candidateAbsoluteProportionError": semi["perClassAnimalMacroAbsoluteProportionError"]["RU"],
            "bestSimpleBaseline": best_ru,
            "allowedMaximum": best_ru + 0.05,
            "excessOverAllowed": semi["perClassAnimalMacroAbsoluteProportionError"]["RU"] - (best_ru + 0.05),
            "passed": result["gate"]["classwiseCompositionAtMostBestBaselinePlus005"]["RU"],
        },
    }


def build_report() -> dict:
    result = json.loads(RESULT.read_text(encoding="utf-8"))
    readiness = json.loads(READINESS.read_text(encoding="utf-8"))
    rows, preprocessing = read_canonical_rows(DATA)
    if preprocessing != result["source"]["preprocessing"]:
        raise ValueError("Canonical Perea preprocessing differs from frozen confirmatory report")
    windows = extract_windows(rows)
    reserved, _ = animal_split({window["animal"] for window in windows})
    if reserved != ANIMALS or tuple(result["partition"]["confirmatoryAnimalIds"]) != tuple(sorted(ANIMALS)):
        raise ValueError("Frozen confirmatory animal roster changed")

    by_animal: dict[str, list[dict]] = defaultdict(list)
    for window in windows:
        by_animal[window["animal"]].append(window)
    training = [window for animal in sorted(set(by_animal) - ANIMALS) for window in by_animal[animal]]
    baseline_model = fit_baselines(training)
    semi_model = fit_semimarkov(training)
    fitted = {"iid": baseline_model, "persistence": baseline_model, "markov": baseline_model, "semimarkov": semi_model}

    generated_class_minutes = {candidate: Counter() for candidate in CANDIDATES}
    generated_single_class = Counter()
    generated_absent_classes = Counter()
    generated_switches = Counter()
    generated_minutes = Counter()
    generated_duration_runs = {candidate: {label: [] for label in CLASSES} for candidate in CANDIDATES}
    observed_duration_runs = {label: [] for label in CLASSES}
    animal_sequence_counts = {
        candidate: defaultdict(Counter) for candidate in CANDIDATES
    }
    length_strata_counts = {
        candidate: {name: Counter() for _, _, name in LENGTH_BINS}
        for candidate in CANDIDATES
    }
    confirmatory_window_length_counts = Counter()

    for animal in sorted(ANIMALS):
        for window in sorted(by_animal[animal], key=lambda item: item["index"]):
            observed = window["labels"]
            confirmatory_window_length_counts[_length_bin(len(observed))] += 1
            for label, length in _runs(observed):
                observed_duration_runs[label].append(length)
            for candidate in CANDIDATES:
                for replicate in range(REPLICATES):
                    seed = derive_seed(candidate, 5, animal, window["index"], replicate)
                    model = fitted[candidate]
                    sequence = (generate_semimarkov(model, len(observed), seed)
                                if candidate == "semimarkov"
                                else generate(candidate, model, len(observed), seed))
                    if len(sequence) != len(observed) or any(label not in CLASSES for label in sequence):
                        raise ValueError("Replay violated frozen length or ontology contract")
                    counts = Counter(sequence)
                    generated_class_minutes[candidate].update(counts)
                    generated_single_class[candidate] += int(len(counts) == 1)
                    generated_absent_classes[candidate] += len(CLASSES) - len(counts)
                    generated_switches[candidate] += sum(left != right for left, right in zip(sequence, sequence[1:]))
                    generated_minutes[candidate] += len(sequence)
                    animal_sequence_counts[candidate][animal]["windows"] += 1
                    animal_sequence_counts[candidate][animal]["singleClassWindows"] += int(len(counts) == 1)
                    animal_sequence_counts[candidate][animal]["missingClassOccurrences"] += len(CLASSES) - len(counts)
                    animal_sequence_counts[candidate][animal]["switches"] += sum(left != right for left, right in zip(sequence, sequence[1:]))
                    animal_sequence_counts[candidate][animal]["minutes"] += len(sequence)
                    stratum = length_strata_counts[candidate][_length_bin(len(observed))]
                    stratum["windows"] += 1
                    stratum["singleClassWindows"] += int(len(counts) == 1)
                    stratum["missingClassOccurrences"] += len(CLASSES) - len(counts)
                    stratum["switches"] += sum(left != right for left, right in zip(sequence, sequence[1:]))
                    stratum["minutes"] += len(sequence)
                    for label, length in _runs(sequence):
                        generated_duration_runs[candidate][label].append(length)

    total_observed_minutes = sum(result["support"]["observedConfirmatoryClassMinutes"].values())
    sequence_distributions = {}
    for candidate in CANDIDATES:
        total_generated = sum(generated_class_minutes[candidate].values())
        animal_metrics = result["metrics"][candidate]["perAnimal"]
        single_rate = generated_single_class[candidate] / (result["partition"]["confirmatoryWindows"] * REPLICATES)
        absent_rate = generated_absent_classes[candidate] / (result["partition"]["confirmatoryWindows"] * REPLICATES)
        switches_per_minute = generated_switches[candidate] / generated_minutes[candidate]
        # Reconcile replay diagnostics to the frozen evaluator, animal by animal.
        for animal, metrics in animal_metrics.items():
            expected = metrics["diagnostics"]
            counts = animal_sequence_counts[candidate][animal]
            observed = {
                "singleClassReplicateWindowRate": counts["singleClassWindows"] / counts["windows"],
                "missingClassOccurrencesPerReplicateWindow": counts["missingClassOccurrences"] / counts["windows"],
                "switchesPerMinute": counts["switches"] / counts["minutes"],
            }
            if any(abs(observed[key] - expected[key]) > 1e-12 for key in observed):
                raise ValueError(f"{candidate} replay diagnostics differ from frozen report for {animal}")
        sequence_distributions[candidate] = {
            "generatedClassMinutes": total_generated,
            "pooledClassProportions": {label: generated_class_minutes[candidate][label] / total_generated for label in CLASSES},
            "singleClassReplicateWindowRate": single_rate,
            "missingClassOccurrencesPerReplicateWindow": absent_rate,
            "switchesPerMinute": switches_per_minute,
            "completeInteriorRunDurationsByClass": {
                label: _distribution(generated_duration_runs[candidate][label]) for label in CLASSES
            },
            "perAnimalSequenceDiagnostics": {
                animal: {
                    "singleClassReplicateWindowRate": counts["singleClassWindows"] / counts["windows"],
                    "missingClassOccurrencesPerReplicateWindow": counts["missingClassOccurrences"] / counts["windows"],
                    "switchesPerMinute": counts["switches"] / counts["minutes"],
                }
                for animal, counts in sorted(animal_sequence_counts[candidate].items())
            },
            "lengthStratifiedDiagnostics": {
                name: {
                    "observedConfirmatoryWindows": confirmatory_window_length_counts[name],
                    "replicateWindows": counts["windows"],
                    "singleClassReplicateWindowRate": counts["singleClassWindows"] / counts["windows"] if counts["windows"] else None,
                    "missingClassOccurrencesPerReplicateWindow": counts["missingClassOccurrences"] / counts["windows"] if counts["windows"] else None,
                    "switchesPerMinute": counts["switches"] / counts["minutes"] if counts["minutes"] else None,
                }
                for name, counts in length_strata_counts[candidate].items()
            },
        }

    observed_proportions = {
        label: result["support"]["observedConfirmatoryClassMinutes"][label] / total_observed_minutes
        for label in CLASSES
    }
    readiness_runs = readiness["observedLabelRuns"]
    censoring = {}
    for label in CLASSES:
        class_runs = [run for run in readiness_runs if run["behavior"] == label]
        censored_left = sum(bool(run["leftBoundaryCensored"]) for run in class_runs)
        censored_right = sum(bool(run["rightBoundaryCensored"]) for run in class_runs)
        complete = sum(not run["leftBoundaryCensored"] and not run["rightBoundaryCensored"] for run in class_runs)
        censoring[label] = {
            "observedRuns": len(class_runs), "leftBoundaryCensored": censored_left,
            "rightBoundaryCensored": censored_right, "completeInteriorRuns": complete,
            "fractionTouchingEitherBoundary": (len(class_runs) - complete) / len(class_runs) if class_runs else None,
        }

    per_animal = {}
    for candidate in CANDIDATES:
        per_animal[candidate] = {
            animal: {
                "windows": result["metrics"][candidate]["perAnimal"][animal]["windowCount"],
                "compositionError": result["metrics"][candidate]["perAnimal"][animal]["compositionError"],
                "transitionTV": result["metrics"][candidate]["perAnimal"][animal]["transitionTotalVariation"],
                "RUAbsoluteProportionError": result["metrics"][candidate]["perAnimal"][animal]["perClassAbsoluteProportionError"]["RU"],
            }
            for animal in sorted(ANIMALS)
        }

    return {
        "schemaVersion": "perea-post-nogo-diagnostic.v1",
        "diagnosticOnly": True,
        "decision": "NO_GO_FOR_THIS_CANDIDATE_AND_SOURCE",
        "method": "Frozen 09-confirmatory-v1 model/baseline implementations and seed schedule replayed after outcomes were opened; no fitting, tuning, threshold changes, or selection on held-out labels beyond this descriptive replay.",
        "artifactSha256": {
            "source": _sha(DATA), "confirmatoryResult": _sha(RESULT), "timeSeriesReadiness": _sha(READINESS),
            "confirmatoryProtocol": _sha(PROTOCOL), "diagnosticProtocol": _sha(DIAGNOSTIC_PROTOCOL),
            "candidate": _sha(MODEL_SOURCE), "confirmatoryEvaluator": _sha(EVALUATOR),
        },
        "partition": {"trainingAnimals": 20, "confirmatoryAnimals": sorted(ANIMALS), "confirmatoryWindows": result["partition"]["confirmatoryWindows"], "replicatesPerWindow": REPLICATES},
        "coverage": {
            "sourceExactMinuteWindows": readiness["coverage"]["contiguousWindows"],
            "sourceDiscontinuities": readiness["coverage"]["discontinuities"],
            "complete24HourWindows": readiness["coverage"]["complete24HourWindows"],
            "confirmatoryWindowLengthCounts": dict(sorted(confirmatory_window_length_counts.items(), key=lambda item: next(i for i, (_, _, name) in enumerate(LENGTH_BINS) if name == item[0]))),
        },
        "gateDiagnostics": _gate_diagnostics(result),
        "observedConfirmatoryClassProportions": observed_proportions,
        "sequenceDiagnostics": sequence_distributions,
        "observedAnnotatedRunDurationsByClass": {
            label: _distribution(observed_duration_runs[label]) for label in CLASSES
        },
        "trainingCompleteDurationSupportByClass": {
            label: _distribution([duration for values in semi_model["durationSamplesByAnimal"].get(label, {}).values() for duration in values])
            for label in CLASSES
        },
        "pereaSourceCensoringByClass": censoring,
        "perAnimalFrozenMetrics": per_animal,
        "animalMetricRanges": {
            candidate: {
                metric: {
                    "minimum": min(values), "maximum": max(values), "range": max(values) - min(values),
                }
                for metric, values in {
                    "compositionError": [row["compositionError"] for row in per_animal[candidate].values()],
                    "transitionTV": [row["transitionTV"] for row in per_animal[candidate].values()],
                }.items()
            }
            for candidate in CANDIDATES
        },
        "limitations": [
            "The four confirmatory animals come from the same Perea source/two ranch contexts and do not establish external validity.",
            "Generated replicates are deterministic synthetic outputs, not independent biological observations or uncertainty intervals.",
            "Observed runs are based on sampled exact-minute annotation windows, may touch window boundaries, and are affected by the source sub-30-second carry-forward rule.",
            "No complete 24-hour windows exist; circadian activity budgets are unsupported.",
            "No intervention, forage availability, climate exposure linkage, physiology, DMI, ADG, or weight outcomes were measured by this comparison.",
            "The replay is a post-hoc descriptive diagnostic on an already opened holdout. It cannot be used to modify or select this candidate.",
        ],
    }


def render_markdown(report: dict) -> str:
    gates = report["gateDiagnostics"]
    lines = [
        "# Perea post-NO-GO diagnostic replay v1", "",
        "**Decision remains NO-GO.** This artifact is a fixed-seed descriptive replay; it does not revise the candidate, thresholds, or original confirmatory result.", "",
        f"Source SHA-256: `{report['artifactSha256']['source']}`  ",
        f"Confirmatory report SHA-256: `{report['artifactSha256']['confirmatoryResult']}`  ",
        f"Diagnostic protocol SHA-256: `{report['artifactSha256']['diagnosticProtocol']}`", "",
        "## Frozen gate arithmetic", "",
        "| Criterion | Candidate | Comparator / limit | Margin | Result |", "|---|---:|---:|---:|---|",
        f"| Composition MAE | {gates['composition']['candidate']:.6f} | best {gates['composition']['bestSimpleBaseline']:.6f} + 0.010 | {gates['composition']['excessOverAllowed']:+.6f} beyond limit | FAIL |",
        f"| Transition TV vs IID | {gates['transitionTV']['candidate']:.6f} | IID {gates['transitionTV']['iid']:.6f}; improvement {gates['transitionTV']['improvementVsIid']:.6f} (need 0.020) | — | {'PASS' if gates['transitionTV']['passed']['iid'] else 'FAIL'} |",
        f"| Transition TV vs persistence | {gates['transitionTV']['candidate']:.6f} | persistence {gates['transitionTV']['persistence']:.6f}; improvement {gates['transitionTV']['improvementVsPersistence']:.6f} (need 0.020) | — | {'PASS' if gates['transitionTV']['passed']['persistence'] else 'FAIL'} |",
        f"| RU class composition error | {gates['rareClassRU']['candidateAbsoluteProportionError']:.6f} | best {gates['rareClassRU']['bestSimpleBaseline']:.6f} + 0.050 | {gates['rareClassRU']['excessOverAllowed']:+.6f} beyond limit | FAIL |", "",
        "## Frozen baseline comparison", "",
        "Lower errors are better. The original gate uses animal-macro metrics; these are not confidence intervals.", "",
        "| Generator | Composition MAE | Transition TV | Composition comparison | Transition comparison |", "|---|---:|---:|---|---|",
    ]
    for name in CANDIDATES:
        m = report["perAnimalFrozenMetrics"][name]
        composition = statistics.mean(row["compositionError"] for row in m.values())
        transition = statistics.mean(row["transitionTV"] for row in m.values())
        if name == "semimarkov":
            composition_comparison = transition_comparison = "reference"
        else:
            composition_comparison = "better than" if composition < gates["composition"]["candidate"] else "worse than"
            transition_comparison = "better than" if transition < gates["transitionTV"]["candidate"] else "worse than"
        lines.append(f"| {name} | {composition:.6f} | {transition:.6f} | {composition_comparison} semi-Markov | {transition_comparison} semi-Markov |")
    lines.extend(["", "The IID baseline had the best composition score (0.360879); first-order Markov had the next-best (0.369417). Semi-Markov had the lowest transition TV (0.707474), but its 0.005009 improvement over persistence did not meet the frozen 0.02 margin. No baseline is a generally valid behavior generator.", "", "## Coverage, censoring, and generated sequence diagnostics", "", f"Across the source, the readiness audit found {report['coverage']['sourceExactMinuteWindows']} operational exact-minute windows, {report['coverage']['sourceDiscontinuities']} discontinuities, and zero complete 24-hour windows. The table combines source-wide censoring counts with the confirmatory subset's observed and replayed internal runs; these populations are labeled separately.", "", "| Class | Confirmatory minute share | Source runs | Boundary-censored source runs | Confirmatory complete durations: median [Q25, Q75] min (n) | Semi-Markov generated durations: median [Q25, Q75] min (n) | Train duration support: n / median min |", "|---|---:|---:|---:|---:|---:|---:|"])
    for label in CLASSES:
        obs_dur = report["observedAnnotatedRunDurationsByClass"][label]
        sem_dur = report["sequenceDiagnostics"]["semimarkov"]["completeInteriorRunDurationsByClass"][label]
        obs = report["observedConfirmatoryClassProportions"][label]
        censor = report["pereaSourceCensoringByClass"][label]
        training_duration = report["trainingCompleteDurationSupportByClass"][label]
        lines.append(f"| {label} | {obs:.3f} | {censor['observedRuns']} | {censor['fractionTouchingEitherBoundary']:.1%} ({censor['completeInteriorRuns']} complete across source) | {obs_dur['medianMinutes']} [{obs_dur['q25Minutes']}, {obs_dur['q75Minutes']}] (n={obs_dur['completeInteriorRuns']}) | {sem_dur['medianMinutes']} [{sem_dur['q25Minutes']}, {sem_dur['q75Minutes']}] (n={sem_dur['completeInteriorRuns']} synthetic) | {training_duration['completeInteriorRuns']} / {training_duration['medianMinutes']} |")
    lines.extend(["", "The generated medians are conditional on fixed target windows and sampled training durations; they are not estimates of biological bout duration. The semi-Markov training sample for RU contained only two complete durations across 20 animals.", "", "### Short-window sensitivity of missing-class diagnostics", "", "The observed target windows average only about six minutes; every synthetic replicate inherits that exact short length. Single-class outputs at one- or two-minute length are structurally expected, so the overall single-class rate alone is not evidence of mode collapse.", "", "| Target length (minutes) | Observed windows | Semi-Markov single-class rate | IID single-class rate | Markov single-class rate |", "|---|---:|---:|---:|---:|"])
    for name in ("1", "2", "3-5", "6-15", "16+"):
        observed_count = report["coverage"]["confirmatoryWindowLengthCounts"].get(name, 0)
        rates = {candidate: report["sequenceDiagnostics"][candidate]["lengthStratifiedDiagnostics"][name]["singleClassReplicateWindowRate"] for candidate in ("semimarkov", "iid", "markov")}
        lines.append(f"| {name} | {observed_count} | {rates['semimarkov']:.1%} | {rates['iid']:.1%} | {rates['markov']:.1%} |" if observed_count else f"| {name} | 0 | n/a | n/a | n/a |")
    lines.extend(["", "Length-stratified rates should be read against the matching short sequence length and are descriptive only. Persistence is degenerate by construction; semi-Markov omission rates above IID/Markov warrant further protocol work, but do not by themselves prove biological implausibility.", "", "| Generator | Single-class generated windows | Missing class occurrences / window | Switches / generated minute |", "|---|---:|---:|---:|"])
    for name in CANDIDATES:
        d = report["sequenceDiagnostics"][name]
        lines.append(f"| {name} | {d['singleClassReplicateWindowRate']:.1%} | {d['missingClassOccurrencesPerReplicateWindow']:.3f} | {d['switchesPerMinute']:.3f} |")
    lines.extend(["", "## Per-animal variation", "", "The table reports the already frozen held-out scores, not uncertainty estimates. Window counts differ; these four animals cannot establish population-level heterogeneity.", "", "| Generator | Animal | Windows | Composition MAE | Transition TV | RU composition error |", "|---|---|---:|---:|---:|---:|"])
    for candidate in CANDIDATES:
        for animal, values in report["perAnimalFrozenMetrics"][candidate].items():
            lines.append(f"| {candidate} | {animal} | {values['windows']} | {values['compositionError']:.6f} | {values['transitionTV']:.6f} | {values['RUAbsoluteProportionError']:.6f} |")
    ranges = report["animalMetricRanges"]["semimarkov"]
    lines.append("")
    lines.append(f"Semi-Markov held-out composition ranges from {ranges['compositionError']['minimum']:.3f} to {ranges['compositionError']['maximum']:.3f}, while transition TV ranges from {ranges['transitionTV']['minimum']:.3f} to {ranges['transitionTV']['maximum']:.3f}. This is a visible descriptive spread, but four same-source animals and unequal windows are too few to decide whether population heterogeneity is excessive or to estimate its distribution.")
    lines.extend(["", "## Findings and unresolved questions", "", "**Supported by these artifacts:** composition performance is not better enough than IID; semi-Markov transition fidelity is only marginally better than persistence; RU composition fails its class-wise margin; and semi-Markov outputs are less diverse than IID/Markov for the same 2–15 minute target windows. The aggregate single-class rate is strongly affected by short windows: 85/226 targets contain one minute and are necessarily single-class. These diagnostics support local sequence undercoverage relative to the controls, not a conclusion of biologically implausible behavior. Temporal coverage/censoring prevents interpreting annotated-run duration as full biological bouts.", "", "**Not established:** the cause of RU error (true rarity, recording schedule, annotator carry-forward, ranch/breed heterogeneity, or transition mismatch); population-wide inter-animal variance; daily/circadian budgets; intervention response; behavior-to-intake/weight effects; whether another model family would generalize; or biological implausibility of any generated duration distribution.", "", "## Limits", ""])
    lines.extend(f"- {item}" for item in report["limitations"])
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUTPUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUTPUT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON.relative_to(ROOT)} and {OUTPUT_MD.relative_to(ROOT)}; decision remains NO-GO")


if __name__ == "__main__":
    main()
