"""Reproducible, non-modeling preparation of the Perea v2 time series.

This module preserves the historical grouped-classifier duplicate policy. It
does not infer physiology, activity outside observed windows, or unsmoothed
behavior durations.
"""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path


EXPECTED_COLUMNS = ["Breed", "ID", "Time.MTD", "MI", "State", "Behavior"]
BEHAVIORS = ("GR", "RE", "RU", "WA")
STATES = {"AC", "ST"}
EXPECTED_MD5 = "7cd143e8cccc79a5e159eaa83428529f"
ROOT = Path(__file__).resolve().parents[3]


def read_canonical_rows(path: Path, expected_md5: str = EXPECTED_MD5) -> tuple[list[dict], dict]:
    """Parse/validate source rows, collapse same-label duplicate minutes.

    All rows at a contradictory animal-minute are excluded, matching
    scripts/evaluate_perea_behavior_grouped.py. Motion index is averaged only
    for non-conflicting repeated labels. Source timestamps remain naive local
    Mountain wall-clock values because the source has no per-row UTC offset.
    """
    raw = path.read_bytes()
    source_md5 = hashlib.md5(raw).hexdigest()
    if expected_md5 and source_md5 != expected_md5:
        raise ValueError(f"Perea source MD5 mismatch: {source_md5}")
    groups: dict[tuple[str, str, datetime], list[dict]] = defaultdict(list)
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise ValueError(f"Unexpected Perea schema: {reader.fieldnames}")
        for line, source in enumerate(reader, start=2):
            breed = source["Breed"].strip()
            animal_id = source["ID"].strip()
            timestamp = datetime.strptime(source["Time.MTD"].strip(), "%m/%d/%Y %H:%M")
            motion = float(source["MI"])
            state = source["State"].strip()
            behavior = source["Behavior"].strip()
            if not breed or not animal_id or behavior not in BEHAVIORS:
                raise ValueError(f"Invalid identity or behavior at CSV line {line}")
            if state not in STATES or not 0 <= motion <= 30:
                raise ValueError(f"Invalid state or motion index at CSV line {line}")
            if (behavior in {"GR", "WA"}) != (state == "AC"):
                raise ValueError(f"Behavior/state mismatch at CSV line {line}")
            groups[(breed, animal_id, timestamp)].append({
                "breed": breed, "animal_id": animal_id,
                "group_id": f"{breed}:{animal_id}", "timestamp": timestamp,
                "motion_index": motion, "state": state, "behavior": behavior,
                "source_line": line,
            })

    duplicate_keys = {key: values for key, values in groups.items() if len(values) > 1}
    conflicting = {key: values for key, values in duplicate_keys.items()
                   if len({row["behavior"] for row in values}) > 1}
    canonical = []
    for key, values in groups.items():
        if key in conflicting:
            continue
        item = values[0].copy()
        item["motion_index"] = sum(row["motion_index"] for row in values) / len(values)
        item["source_rows"] = len(values)
        canonical.append(item)
    canonical.sort(key=lambda row: (row["group_id"], row["timestamp"], row["source_line"]))
    audit = {
        "sourceRows": sum(map(len, groups.values())),
        "animalMinuteKeys": len(groups),
        "animals": len({row["group_id"] for row in canonical}),
        "repeatedAnimalMinuteKeys": len(duplicate_keys),
        "excessRowsAtRepeatedKeys": sum(len(values) - 1 for values in duplicate_keys.values()),
        "conflictingLabelKeys": len(conflicting),
        "rowsExcludedForConflictingLabels": sum(map(len, conflicting.values())),
        "sameLabelKeysCollapsed": sum(key not in conflicting for key in duplicate_keys),
        "analysisRows": len(canonical),
        "duplicatePolicy": "Same-label rows for an animal-minute collapse to one row with mean motion index; all rows for conflicting-label minutes are excluded.",
    }
    return canonical, audit


def _summarize_runs(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Build exact-minute contiguous windows and observed label runs."""
    by_animal: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_animal[row["group_id"]].append(row)
    windows, runs = [], []
    for group_id, animal_rows in sorted(by_animal.items()):
        segments: list[list[dict]] = []
        for row in animal_rows:
            if not segments or row["timestamp"] - segments[-1][-1]["timestamp"] != timedelta(minutes=1):
                segments.append([row])
            else:
                segments[-1].append(row)
        for index, segment in enumerate(segments, start=1):
            start, end = segment[0]["timestamp"], segment[-1]["timestamp"]
            window_id = f"{group_id}#{index}"
            windows.append({
                "id": window_id, "animal": group_id,
                "startLocal": start.isoformat(timespec="minutes"),
                "endLocal": end.isoformat(timespec="minutes"),
                "observedMinutes": len(segment),
                "elapsedMinutesBetweenFirstAndLast": int((end - start).total_seconds() // 60),
                "complete24HourWindow": len(segment) >= 1440,
                "classMinutes": dict(sorted(Counter(row["behavior"] for row in segment).items())),
            })
            current = []
            for row in segment:
                if current and row["behavior"] != current[-1]["behavior"]:
                    runs.append(_run_record(window_id, current, current[0] is segment[0], False))
                    current = []
                current.append(row)
            if current:
                runs.append(_run_record(window_id, current, current[0] is segment[0], True))
    return windows, runs


def _run_record(window_id: str, rows: list[dict], left_censored: bool, right_censored: bool) -> dict:
    return {
        "windowId": window_id, "behavior": rows[0]["behavior"],
        "observedLabelMinutes": len(rows),
        "firstLocal": rows[0]["timestamp"].isoformat(timespec="minutes"),
        "lastLocal": rows[-1]["timestamp"].isoformat(timespec="minutes"),
        "leftBoundaryCensored": left_censored,
        "rightBoundaryCensored": right_censored,
    }


def readiness_report(path: Path, source_readme: Path) -> dict:
    rows, duplicate_audit = read_canonical_rows(path)
    windows, runs = _summarize_runs(rows)
    per_class = {}
    for behavior in BEHAVIORS:
        class_runs = [run for run in runs if run["behavior"] == behavior]
        per_class[behavior] = {
            "observedLabelMinutes": sum(run["observedLabelMinutes"] for run in class_runs),
            "observedRuns": len(class_runs),
            "runLengthObservedLabelMinutes": {
                "min": min((r["observedLabelMinutes"] for r in class_runs), default=None),
                "median": _median([r["observedLabelMinutes"] for r in class_runs]),
                "max": max((r["observedLabelMinutes"] for r in class_runs), default=None),
            },
            "leftBoundaryCensoredRuns": sum(r["leftBoundaryCensored"] for r in class_runs),
            "rightBoundaryCensoredRuns": sum(r["rightBoundaryCensored"] for r in class_runs),
        }
    naive_times = [row["timestamp"] for row in rows]
    readme = source_readme.read_text(encoding="utf-8")
    return {
        "schemaVersion": "perea-time-series-readiness.v1",
        "source": {
            "file": path.resolve().relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "md5": hashlib.md5(path.read_bytes()).hexdigest(),
            "doi": "10.6084/m9.figshare.28801181.v2", "license": "CC BY 4.0 (source audit declaration; verify before redistribution)",
            "licenseDeclaredInLocalSourceAudit": "license and citation recorded in existing Perea source audit; this report does not independently re-check current upstream terms",
            "readmeContainsMountainTime": "mountain time" in readme.lower(),
        },
        "preprocessing": duplicate_audit,
        "coverage": {
            "animals": len({row["group_id"] for row in rows}),
            "contiguousWindows": len(windows),
            "windows": windows,
            "discontinuities": max(0, len(windows) - len({row["group_id"] for row in rows})),
            "complete24HourWindows": sum(window["complete24HourWindow"] for window in windows),
            "firstTimestampLocalWallClock": min(naive_times).isoformat(timespec="minutes"),
            "lastTimestampLocalWallClock": max(naive_times).isoformat(timespec="minutes"),
            "timeZone": "Source describes Mountain Time, but rows contain no UTC offset or DST fold; timestamps are preserved as naive local wall-clock values and are not converted to UTC.",
            "sessionDefinition": "A contiguous window requires exactly one minute between eligible adjacent animal observations; any gap or conflicting-label minute breaks the window. This is an operational coverage window, not a source-declared video session.",
        },
        "classCoverage": per_class,
        "observedLabelRuns": runs,
        "annotationLimitations": {
            "carryForward": "README reports that labels for events shorter than 30 seconds may carry forward a previous annotation. Original sub-minute event timing is unavailable; observed run lengths are not unbiased biological bout durations.",
            "durationInterpretation": "Run lengths count eligible annotated minute samples. Runs touching a contiguous-window boundary are censored; these are descriptive annotation runs, not full behavior duration estimates.",
            "temporalSupport": "Sampled video windows only; no complete 24-hour window supports daily activity budgets or circadian claims.",
        },
        "readiness": {
            "sequenceModeling": "INTERNAL_EXPLORATORY_ONLY",
            "circadianOr24HourMetrics": "NOT_SUPPORTED" if not any(w["complete24HourWindow"] for w in windows) else "REVIEW_REQUIRED",
            "externalValidation": "NOT_READY",
            "availableMeasurements": ["animal identity", "local wall-clock timestamp", "annotated behavior label", "motion index", "state label"],
            "unavailableOutcomes": ["weight", "ADG", "DMI", "physiological state", "unsmoothed sub-minute behavior"],
        },
        "compatibility": {
            "legacyReader": "scripts/evaluate_perea_behavior_grouped.py::read_observations",
            "rowOrderAndDuplicatePolicy": "Same animal-minute grouping; conflicting label keys excluded; same-label keys collapsed with mean MI; sorted by animal, timestamp, source line.",
            "canonicalObservationSha256": canonical_observation_sha256(rows),
            "modelFittingPerformed": False,
        },
    }


def _median(values: list[int]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    return float(ordered[midpoint]) if len(ordered) % 2 else (ordered[midpoint - 1] + ordered[midpoint]) / 2


def canonical_observation_sha256(rows: list[dict]) -> str:
    """Digest a stable JSON representation shared with parity tests."""
    projection = [{
        "group_id": row["group_id"],
        "timestamp": row["timestamp"].isoformat(timespec="minutes"),
        "motion_index": row["motion_index"],
        "state": row["state"],
        "behavior": row["behavior"],
        "source_rows": row["source_rows"],
    } for row in rows]
    encoded = json.dumps(projection, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
