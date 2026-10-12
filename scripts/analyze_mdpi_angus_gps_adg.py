#!/usr/bin/env python3
"""Describe cow-season ADG and GPS grazing summaries in the public MDPI supplement.

This is a small, separate cohort analysis for domain review. It does not validate
or calibrate the Agroville engine and does not estimate causal effects.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import statistics
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/mdpi-angus-cow-grazing"
REPORT_PATH = ROOT / "docs/evidence/mdpi-angus-gps-adg-association.json"
AGE_LABELS = {"4": "4", "5": "5-7", "6": "8+"}
YEAR_MAP = {"Y1": "2018", "Y2": "2019"}


def _read_csv(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with archive.open(name) as stream:
        return list(csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig")))


def _number(value: str, label: str) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {label}: {value!r}") from exc
    if not math.isfinite(result):
        raise ValueError(f"Non-finite {label}: {value!r}")
    return result


def _average_ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        average = (start + 1 + end) / 2
        for position in range(start, end):
            ranks[order[position]] = average
        start = end
    return ranks


def _spearman(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or len(left) < 2:
        return None
    left_ranks = _average_ranks(left)
    right_ranks = _average_ranks(right)
    left_mean = statistics.fmean(left_ranks)
    right_mean = statistics.fmean(right_ranks)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left_ranks, right_ranks))
    left_ss = sum((a - left_mean) ** 2 for a in left_ranks)
    right_ss = sum((b - right_mean) ** 2 for b in right_ranks)
    if left_ss == 0 or right_ss == 0:
        return None
    return numerator / math.sqrt(left_ss * right_ss)


def _correlation(rows: list[dict], metric: str) -> dict:
    result = {
        "nCowSeasons": len(rows),
        "spearmanRho": None,
        "outcome": "ADG derived from study-period weight change; not an observed daily series.",
        "grazingMetric": "Mean of available daily GPS measurements per cow-season.",
    }
    rho = _spearman([row["adgDerivedKgPerDay"] for row in rows], [row[metric] for row in rows])
    result["spearmanRho"] = None if rho is None else round(rho, 6)
    return result


def analyze() -> dict:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    archive_path = DATA_DIR / manifest["archive"]["path"]
    archive_bytes = archive_path.read_bytes()
    digest = hashlib.sha256(archive_bytes).hexdigest()
    if len(archive_bytes) != manifest["archive"]["bytes"] or digest != manifest["archive"]["sha256"]:
        raise ValueError("Supplement archive does not match its pinned manifest")

    with zipfile.ZipFile(archive_path) as archive:
        s1 = _read_csv(archive, "Table S1.csv")
        s3 = _read_csv(archive, "Table S3.csv")

    required_s1 = {"Year", "ID", "RFI_Class", "Age_Class", "Tot_Wt_Ch_kg"}
    required_s3 = {"Year", "ID", "Day", "Time_gr_hr", "Dist_km"}
    if not s1 or not required_s1.issubset(s1[0]) or not s3 or not required_s3.issubset(s3[0]):
        raise ValueError("Supplement table schema changed")

    weight_by_key: dict[tuple[str, str], dict] = {}
    for source in s1:
        if source["Age_Class"] not in AGE_LABELS:
            continue
        if source["Year"] not in YEAR_MAP:
            raise ValueError(f"Unexpected S1 year: {source['Year']}")
        raw_change = source["Tot_Wt_Ch_kg"].strip()
        if not raw_change or raw_change.upper() == "NA":
            continue
        key = (YEAR_MAP[source["Year"]], source["ID"])
        if key in weight_by_key:
            raise ValueError(f"Duplicate S1 cow-season key: {key}")
        weight_by_key[key] = {
            "year": key[0],
            "animalId": key[1],
            "ageClass": AGE_LABELS[source["Age_Class"]],
            "rfiClass": source["RFI_Class"],
            "adgDerivedKgPerDay": _number(raw_change, "weight change") / 84,
        }

    gps_days: dict[tuple[str, str], list[dict[str, float]]] = defaultdict(list)
    seen_days: set[tuple[str, str, str]] = set()
    for source in s3:
        if not source["Day"]:
            continue
        if source["Year"] not in YEAR_MAP.values():
            raise ValueError(f"Unexpected S3 year: {source['Year']}")
        key = (source["Year"], source["ID"])
        if key not in weight_by_key:
            continue
        day_key = (*key, source["Day"])
        if day_key in seen_days:
            raise ValueError(f"Duplicate S3 cow-day key: {day_key}")
        seen_days.add(day_key)
        day = {}
        for column, metric in (("Time_gr_hr", "grazingHours"), ("Dist_km", "distanceKm")):
            raw = source[column].strip()
            if raw:
                day[metric] = _number(raw, column)
        gps_days[key].append(day)

    matched = []
    for key, days in sorted(gps_days.items()):
        weight = weight_by_key[key]
        row = dict(weight)
        row["gpsDays"] = len(days)
        for metric in ("grazingHours", "distanceKm"):
            values = [day[metric] for day in days if metric in day]
            if not values:
                break
            row[metric] = statistics.fmean(values)
            row[f"{metric}ObservedDays"] = len(values)
        else:
            matched.append(row)

    if len(matched) < 2:
        raise ValueError("Too few paired cow-season rows for descriptive association")

    by_year = {}
    for year in sorted(YEAR_MAP.values()):
        selected = [row for row in matched if row["year"] == year]
        by_year[year] = {
            "nCowSeasons": len(selected),
            "grazingHours": _correlation(selected, "grazingHours"),
            "distanceKm": _correlation(selected, "distanceKm"),
        }

    gps_day_counts = [row["gpsDays"] for row in matched]
    return {
        "source": {
            "articleDoi": manifest["source"]["articleDoi"],
            "license": manifest["source"]["license"],
            "supplementSha256Verified": True,
            "supplementSha256": digest,
            "weightTable": "Table S1.csv",
            "gpsTable": "Table S3.csv",
        },
        "join": {
            "ageClasses": ["4", "5-7", "8+"],
            "yearMap": YEAR_MAP,
            "key": "mapped year + cow ID",
            "matchedCowSeasons": len(matched),
            "uniqueCowIds": len({row["animalId"] for row in matched}),
            "cowDays": sum(gps_day_counts),
            "gpsDaysPerCowSeason": {
                "min": min(gps_day_counts),
                "mean": round(statistics.fmean(gps_day_counts), 3),
                "max": max(gps_day_counts),
            },
            "rowsByYear": {year: count for year, count in sorted(Counter(row["year"] for row in matched).items())},
            "ageClassesMatched": dict(sorted(Counter(row["ageClass"] for row in matched).items())),
            "rfiClassesMatched": dict(sorted(Counter(row["rfiClass"] for row in matched).items())),
        },
        "method": {
            "adg": "S1 Tot_Wt_Ch_kg / 84 days, using the article-reported study period.",
            "grazingHours": "Mean of non-missing daily Time_gr_hr values for each matched cow-season.",
            "distanceKm": "Mean of non-missing daily Dist_km values for each matched cow-season.",
            "association": "Spearman rank correlation across cow-season means; also reported separately by year.",
            "pValues": "Not calculated or reported.",
        },
        "association": {
            "pooled": {
                "grazingHours": _correlation(matched, "grazingHours"),
                "distanceKm": _correlation(matched, "distanceKm"),
            },
            "byYear": by_year,
        },
        "interpretation": {
            "use": "Exploratory, separate-cohort evidence for the specialist review of the #1 population question.",
            "causalInference": False,
            "validatesEngine": False,
            "uncertaintyCalibration": False,
            "limitations": [
                "The GPS subset is selected and represents only part of the reported 84-day weight-change period.",
                "Per-cow GPS coverage varies; the matched rows have 30-49 observed cow-days each.",
                "ADG is derived from study-level duration, not verified individual start/end dates or a daily series.",
                "The overall correlations can reflect between-year differences; the year-specific estimates are also small and not stable evidence of a repeatable association.",
                "The sample is small (37 cow-seasons from 37 IDs) and does not control all age, RFI, forage, weather, or animal-state factors.",
                "This Montana cohort is separate from the approved USDA/CPER cohort; do not pool records or transfer its associations to CPER or Brazilian farms.",
            ],
        },
    }


if __name__ == "__main__":
    report = analyze()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
