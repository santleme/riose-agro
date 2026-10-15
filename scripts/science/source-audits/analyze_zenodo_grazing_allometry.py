#!/usr/bin/env python3
"""Exploratory adult-cow ADG/foraging associations; not engine validation."""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data/zenodo-grazing-allometry/Zenodo_Data_Allometry.txt"
REPORT = ROOT / "docs/evidence/zenodo-grazing-allometry-association.json"
HORIZON_DAYS = 70
METRICS = {
    "Steps_mean": "mean_steps_per_hour",
    "Speed_mean": "mean_distance_per_hour_m_per_h",
    "Lying_mean": "lying_ratio",
    "Space_evenness_mean": "space_use_evenness",
    "Sel_evenness_mean": "forage_selection_evenness",
    "Sel_quality_mean": "selected_forage_quality_indicator",
}


def _rank(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        average_rank = ((start + 1) + end) / 2
        for position in order[start:end]:
            ranks[position] = average_rank
        start = end
    return ranks


def _correlation(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x == 0 or var_y == 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def _spearman(xs: list[float], ys: list[float]) -> float | None:
    return _correlation(_rank(xs), _rank(ys))


def analyze() -> dict:
    with DATA.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    if len(rows) != 27:
        raise ValueError(f"Expected 27 cows, received {len(rows)}")

    cows = []
    for index, row in enumerate(rows, start=1):
        cows.append({
            "row": index,
            "breed": row["Breed"],
            "ageMonths": int(row["Age"]),
            "adgKgPerDayDerived": (float(row["Weight_2"]) - float(row["Weight_1"])) / HORIZON_DAYS,
            **{
                field: (float(row[field]) if row[field] not in {"", "NA", "NaN"} else None)
                for field in METRICS
            },
        })

    results = {}
    for field, meaning in METRICS.items():
        complete = [cow for cow in cows if cow[field] is not None]
        xs = [cow[field] for cow in complete]
        ys = [cow["adgKgPerDayDerived"] for cow in complete]
        grouped = {}
        centered_x = []
        centered_y = []
        for breed in sorted({cow["breed"] for cow in complete}):
            group = [cow for cow in complete if cow["breed"] == breed]
            group_x = _rank([cow[field] for cow in group])
            group_y = _rank([cow["adgKgPerDayDerived"] for cow in group])
            n = len(group)
            centered_x.extend(value - (n + 1) / 2 for value in group_x)
            centered_y.extend(value - (n + 1) / 2 for value in group_y)
            grouped[breed] = {
                "n": n,
                "spearman": _spearman([cow[field] for cow in group], [cow["adgKgPerDayDerived"] for cow in group]),
            }

        results[field] = {
            "meaning": meaning,
            "nComplete": len(complete),
            "nMissing": len(cows) - len(complete),
            "nByBreed": {breed: sum(cow["breed"] == breed for cow in complete) for breed in sorted({cow["breed"] for cow in cows})},
            "pooledSpearman": _spearman(xs, ys),
            "withinBreedCenteredRankCorrelation": _correlation(centered_x, centered_y),
            "byBreedSpearman": grouped,
        }

    return {
        "source": {
            "datasetDoi": "10.5281/zenodo.3707638",
            "articleDoi": "10.3389/fvets.2020.00494",
            "localAudit": "zenodo-grazing-allometry-audit.json",
        },
        "population": {"nCows": len(cows), "nPerBreed": {breed: sum(cow["breed"] == breed for cow in cows) for breed in sorted({cow["breed"] for cow in cows})}, "ageMonthsMin": min(cow["ageMonths"] for cow in cows), "ageMonthsMax": max(cow["ageMonths"] for cow in cows)},
        "outcome": {"field": "(Weight_2 - Weight_1) / 70", "unit": "kg/cow/day", "horizonDaysAssumed": HORIZON_DAYS, "interpretation": "derived endpoint change; exact individual weighing dates unavailable"},
        "method": {
            "pooled": "Spearman correlation across cows with complete outcome and behavior field",
            "withinBreedCenteredRankCorrelation": "Pearson correlation of within-breed centered average ranks; descriptive adjustment for three breed groups",
            "uncertainty": "No inferential p-values or confidence intervals; sample is small and exact weighing dates and stable animal IDs are unavailable",
            "missingValues": "NA values are excluded separately for each behavior field; no imputation",
        },
        "associations": results,
        "limits": [
            "ADG is derived from two endpoints over an assumed 70 days, not a repeated daily growth series.",
            "Behavior summaries cover only 9–10 days for movement and three short observations per cow for forage selection, not the full ADG horizon.",
            "Pedometer step and lying measures are available for six cows per breed; GPS movement measures are missing for three cows.",
            "Pooled associations combine three breeds with strong productivity differences; within-breed rank associations are descriptive and underpowered.",
            "The source supports exploratory adult-cow domain review only; it does not validate the Agroville engine, estimate causal effects, or transfer to Brazilian farms.",
        ],
        "classification": "exploratory_adult_cow_domain_evidence_not_engine_validation",
    }


if __name__ == "__main__":
    report = analyze()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
