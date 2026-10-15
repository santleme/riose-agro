#!/usr/bin/env python3
"""Describe CPER group ADG–ANPP association before/after year and treatment FE.

This is an unweighted, group-level observational analysis, not an engine
validation or causal estimate. No p-values or confidence intervals are
reported because observations are repeated across years and precision fields
are unavailable in the paired records.
"""

from __future__ import annotations

import json
import math
import statistics
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "data/usda-grasscast/cper-grouped-observations.json"
REPORT = ROOT / "docs/evidence/usda-grasscast-cper-association.json"
TOLERANCE = 1e-12
MAX_ITERATIONS = 10_000


def pearson(left: list[float], right: list[float]) -> float:
    mean_left = statistics.fmean(left)
    mean_right = statistics.fmean(right)
    centered_left = [value - mean_left for value in left]
    centered_right = [value - mean_right for value in right]
    sum_left = sum(value * value for value in centered_left)
    sum_right = sum(value * value for value in centered_right)
    denominator = math.sqrt(sum_left * sum_right)
    if denominator == 0:
        raise ValueError("Correlation is undefined for a constant variable")
    return sum(a * b for a, b in zip(centered_left, centered_right)) / denominator


def residualize_two_way(values: list[float], years: list[int], treatments: list[str]) -> list[float]:
    """Absorb year and treatment intercepts with alternating projections."""
    residuals = values.copy()
    groups = [years, treatments]
    for _ in range(MAX_ITERATIONS):
        largest_change = 0.0
        for group_values in groups:
            members: dict[str | int, list[int]] = {}
            for index, group in enumerate(group_values):
                members.setdefault(group, []).append(index)
            means = {
                group: statistics.fmean(residuals[index] for index in indices)
                for group, indices in members.items()
            }
            updated = [value - means[group] for value, group in zip(residuals, group_values)]
            largest_change = max(
                largest_change,
                max(abs(after - before) for after, before in zip(updated, residuals)),
            )
            residuals = updated
        if largest_change < TOLERANCE:
            break
    else:
        raise ValueError("Two-way fixed-effect residualization did not converge")
    return residuals


def analyze() -> dict:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    if data.get("sourceDoi") != "10.15482/USDA.ADC/1521120":
        raise ValueError("Unexpected Grass-Cast source DOI")
    if data.get("joinKey") != ["site=CPER", "year", "grazing.treatment"]:
        raise ValueError("Unexpected CPER group join key")

    rows = [
        row for row in data["observations"]
        if isinstance(row.get("meanAdgKgPerAnimalDay"), (int, float))
        and isinstance(row.get("anppKgDMPerHectare"), (int, float))
        and math.isfinite(row["meanAdgKgPerAnimalDay"])
        and math.isfinite(row["anppKgDMPerHectare"])
    ]
    if len(rows) != 136:
        raise ValueError(f"Expected 136 complete CPER group pairs, got {len(rows)}")

    years = [row["year"] for row in rows]
    treatments = [row["treatment"] for row in rows]
    adg = [float(row["meanAdgKgPerAnimalDay"]) for row in rows]
    anpp = [float(row["anppKgDMPerHectare"]) for row in rows]
    residual_adg = residualize_two_way(adg, years, treatments)
    residual_anpp = residualize_two_way(anpp, years, treatments)
    residual_x_ss = sum(value * value for value in residual_anpp)
    if residual_x_ss == 0:
        raise ValueError("ANPP has no variation after absorbing year/treatment")

    year_counts = Counter(years)
    treatment_counts = Counter(treatments)
    return {
        "classification": "public_observational_group_level_association_not_causal_not_engine_validation",
        "source": {
            "title": "Grass-Cast Database",
            "publisher": "USDA Ag Data Commons",
            "doi": data["sourceDoi"],
            "license": "CC BY 4.0 package; see source site list and manifest for component policies",
            "inputFile": "data/usda-grasscast/cper-grouped-observations.json",
        },
        "question": "Within the CPER group/year/treatment records, how is mean ADG associated with annual ANPP before and after absorbing year and grazing-treatment intercepts?",
        "populationAndUnit": "CPER site; annual group means by grazing treatment; not individual-animal records",
        "completeCases": {
            "n": len(rows),
            "allMatchedKeys": len(data["observations"]),
            "adgAndAnppBothPresent": len(rows),
            "years": len(year_counts),
            "yearRange": [min(years), max(years)],
            "yearsWithThreeTreatments": sum(count == 3 for count in year_counts.values()),
            "rowsByTreatment": dict(sorted(treatment_counts.items())),
            "unweighted": True,
            "precisionWeightsAvailable": False,
        },
        "measures": {
            "outcome": {"field": "meanAdgKgPerAnimalDay", "unit": "kg/animal/day"},
            "exposure": {"field": "anppKgDMPerHectare", "unit": "kg dry matter/ha/year", "method": "cage clipping"},
        },
        "descriptiveResults": {
            "rawPearsonR": pearson(anpp, adg),
            "fixedEffects": {
                "absorbedIntercepts": ["year", "grazing treatment"],
                "residualPearsonR": pearson(residual_anpp, residual_adg),
                "slopeKgAdgPerKgAnppPerHectare": sum(x * y for x, y in zip(residual_anpp, residual_adg)) / residual_x_ss,
                "slopeUnit": "(kg/animal/day) per (kg dry matter/ha/year)",
            },
            "pValue": None,
            "confidenceInterval": None,
        },
        "interpretation": [
            "The raw and fixed-effect-adjusted summaries describe different mixtures of between-year, between-treatment, and within-year/treatment co-variation; their contrast is not a causal estimate.",
            "The analysis is an unweighted association of group means. It does not establish an individual-animal relationship or account for unavailable group sample sizes and standard deviations.",
            "No p-value or interval is reported: the same site and treatment groups recur over time, temporal dependence is not modeled, and precision fields are absent for the complete pairs.",
            "ANPP is annual cage-clipping productivity, not standing forage stock or individual intake.",
            "This historical series is independent of the CPER 2019–2020 animal-period cohort and is not validation, calibration, or prediction evidence for engine.js.",
        ],
    }


if __name__ == "__main__":
    result = analyze()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
