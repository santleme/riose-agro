#!/usr/bin/env python3
"""Descriptive sequential fixed-effect partition of observed Nellore feedlot DMI.

This is a separate exploratory uncertainty artifact. It does not compare DMI
with Riose's engine, estimate measurement error, or fit a predictor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from audit_mendeley_nellore_feedlot import (  # noqa: E402
    MANIFEST_PATH,
    WORKBOOK_PATH,
    _data_rows,
    _read_workbook,
)

REPORT_JSON = ROOT / "docs/evidence/issue-15-nellore-feedlot-dmi-sequential-partition.json"
REPORT_MD = ROOT / "docs/evidence/issue-15-nellore-feedlot-dmi-sequential-partition.md"


def _date_label(serial: str) -> str:
    # Excel's 1900 date system includes the fictitious 1900-02-29.
    return (datetime(1899, 12, 30) + timedelta(days=int(float(serial)))).date().isoformat()


def decompose(records: Iterable[dict[str, str | float]]) -> dict:
    """Sequential OLS sums-of-squares for treatment, animal, date, residual.

    Factors are added in the declared order. Animal is nested within treatment;
    date is crossed with animal. The sequential shares are descriptive and order
    dependent, not random-effect variance estimates.
    """
    rows = list(records)
    if not rows:
        raise ValueError("No observed DMI records")
    for row in rows:
        if row["treatment"] not in {"Shade", "No shade"}:
            raise ValueError("Unexpected treatment label")
        value = float(row["dmi_kg_day"])
        if not math.isfinite(value) or value < 0:
            raise ValueError("DMI must be finite and nonnegative")
    keys = [(str(r["animal_id"]), str(r["date"])) for r in rows]
    if len(keys) != len(set(keys)):
        raise ValueError("Duplicate animal-day DMI record")
    groups: dict[str, str] = {}
    for row in rows:
        animal, treatment = str(row["animal_id"]), str(row["treatment"])
        if animal in groups and groups[animal] != treatment:
            raise ValueError("Animal has inconsistent treatment labels")
        groups[animal] = treatment

    y = np.asarray([float(r["dmi_kg_day"]) for r in rows], dtype=np.float64)
    animals = sorted({str(r["animal_id"]) for r in rows})
    dates = sorted({str(r["date"]) for r in rows})
    treatments = ["No shade", "Shade"]

    def matrix(levels: list[str], values: list[str]) -> np.ndarray:
        # Reference coding with intercept; stable category order.
        return np.column_stack([np.ones(len(values))] + [
            np.fromiter((value == level for value in values), dtype=np.float64)
            for level in levels[1:]
        ])

    treatment_values = [str(r["treatment"]) for r in rows]
    animal_values = [str(r["animal_id"]) for r in rows]
    date_values = [str(r["date"]) for r in rows]
    x0 = np.ones((len(rows), 1), dtype=np.float64)
    x_treatment = matrix(treatments, treatment_values)
    x_animal = matrix(animals, animal_values)
    x_date = matrix(dates, date_values)

    def sse(design: np.ndarray) -> float:
        coefficients, _, _, _ = np.linalg.lstsq(design, y, rcond=None)
        residual = y - design @ coefficients
        return float(residual @ residual)

    sse_intercept = sse(x0)
    sse_treatment = sse(x_treatment)
    # Treatment is exactly aliased with animal identity. Including its column
    # alongside animal dummies is rank deficient; the nested model is animal FE.
    sse_animal = sse(x_animal)
    sse_animal_date = sse(np.column_stack((x_animal, x_date[:, 1:])))
    components = [
        ("treatment_between_animals", sse_intercept - sse_treatment),
        ("animal_within_treatment", sse_treatment - sse_animal),
        ("calendar_date_after_animal", sse_animal - sse_animal_date),
        ("unexplained_animal_day_residual", sse_animal_date),
    ]
    total = sse_intercept
    # Numerical least-squares noise can produce tiny negative increments.
    if any(value < -max(1e-9, total * 1e-10) for _, value in components):
        raise ValueError("Sequential OLS sums of squares are not monotone")
    components = [(name, max(0.0, value)) for name, value in components]
    counts = Counter(str(r["treatment"]) for r in rows)
    by_treatment = {}
    for treatment in treatments:
        values = [float(r["dmi_kg_day"]) for r in rows if r["treatment"] == treatment]
        if not values:
            continue
        by_treatment[treatment] = {
            "nAnimalDays": len(values),
            "animals": len({str(r["animal_id"]) for r in rows if r["treatment"] == treatment}),
            "meanDmiKgPerAnimalDay": round(float(np.mean(values)), 8),
            "sampleSdDmiKgPerAnimalDay": round(float(np.std(values, ddof=1)), 8),
        }
    return {
        "nObservedAnimalDays": len(rows),
        "nAnimals": len(animals),
        "nCalendarDays": len(dates),
        "missingAnimalDaysExcluded": 0,
        "treatmentCounts": dict(sorted(counts.items())),
        "meanDmiKgPerAnimalDay": round(float(np.mean(y)), 8),
        "sampleSdDmiKgPerAnimalDay": round(float(np.std(y, ddof=1)), 8),
        "sequentialOls": {
            "totalCenteredSumSquaresKgSquaredPerDaySquared": round(total, 8),
            "factorOrder": [name for name, _ in components],
            "components": [
                {
                    "name": name,
                    "sumSquares": round(value, 8),
                    "shareOfObservedCenteredSumSquares": round(value / total, 8) if total else 0.0,
                }
                for name, value in components
            ],
            "interpretation": "Sequential fixed-effect sums of squares in this order; descriptive, order-dependent, and not random-effect variance estimates.",
        },
        "byTreatmentDescriptiveOnly": by_treatment,
    }


def load_source() -> tuple[list[dict], dict]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest.get("license") != "CC BY 4.0":
        raise ValueError("Source license is not the manifested CC BY 4.0 license")
    digest = hashlib.sha256(WORKBOOK_PATH.read_bytes()).hexdigest()
    if digest != manifest.get("sha256") or digest != manifest.get("repository_sha256"):
        raise ValueError("Workbook SHA-256 differs from the source manifest")
    sheets = _read_workbook(WORKBOOK_PATH)
    dmi = _data_rows(sheets["Dry matter intake"])
    drinking = _data_rows(sheets["Drinking behaviour"])
    treatment_by_animal: dict[str, str] = {}
    for row in drinking:
        animal, treatment = row.get("Animal ID"), (row.get("Treatment group") or "").strip()
        if not animal or not row.get("Date and time of observation"):
            continue
        if treatment not in {"Shade", "No shade"}:
            raise ValueError("Unexpected treatment group in source")
        previous = treatment_by_animal.setdefault(animal, treatment)
        if previous != treatment:
            raise ValueError(f"Inconsistent treatment assignment for animal {animal}")

    records = []
    all_pairs: set[tuple[str, str]] = set()
    observed_pairs: set[tuple[str, str]] = set()
    for row in dmi:
        animal, serial, value = row.get("Animal ID"), row.get("Date (dd/mm/yyyy)"), row.get("Dry matter intake (kg)")
        if not animal or not serial:
            continue
        date = _date_label(serial)
        pair = (animal, date)
        if pair in all_pairs:
            raise ValueError("Duplicate animal-day in source DMI sheet")
        all_pairs.add(pair)
        if value is None:
            continue
        number = float(value)
        if not math.isfinite(number) or number < 0:
            raise ValueError("Invalid observed DMI")
        if animal not in treatment_by_animal:
            raise ValueError(f"No treatment metadata for animal {animal}")
        observed_pairs.add(pair)
        records.append({"animal_id": animal, "date": date, "treatment": treatment_by_animal[animal], "dmi_kg_day": number})
    return records, {
        "doi": manifest["doi"],
        "articleDoi": manifest["article_doi"],
        "license": manifest["license"],
        "sha256": digest,
        "sourceUrl": manifest["source_url"],
        "animalDayPairs": len(all_pairs),
        "observedAnimalDays": len(observed_pairs),
        "missingDmiValuesExcluded": len(all_pairs) - len(observed_pairs),
    }


def analyze(records: Iterable[dict], source: dict) -> dict:
    result = decompose(records)
    return {
        "title": "Observed daily DMI variability in adult Nellore feedlot steers",
        "classification": "descriptive_feedlot_cohort_variability_not_pasture_validation",
        "source": source,
        "population": {
            "species": "Bos taurus indicus (Nellore cattle)",
            "category": "22-month-old steers",
            "system": "controlled tropical feedlot study",
            "period": "82 calendar dates with DMI animal-day slots; study reported as 83 days",
            "treatments": "Shade and No shade; 47 animals across four collective pens (two pens per treatment, per associated article)",
        },
        "outcome": {"name": "observed daily dry matter intake", "unit": "kg dry matter per animal per day", "targetScope": "feedlot Nellore steers only"},
        "analysis": result,
        "scientificLimitations": [
            "This is an exploratory description of one feedlot cohort, not evidence for mature beef cows grazing pasture or the DMI target in issue 109.",
            "Treatment is constant within animal and associated with collective pen assignment. The treatment share is a descriptive between-group sum of squares, not an independently replicated treatment variance or causal shade effect.",
            "The animal term is the sequential contribution of animal identity after the treatment grouping. It is not measurement error and does not separate stable animal differences from all other animal-level factors.",
            "The calendar-date term is a common date contribution conditional on animal identity. It is not attributed to weather or another cause.",
            "The residual combines remaining animal-day variation and any unmeasured influences; no independent replicate measurement exists here to identify measurement error.",
            "Sums of squares are sequential and order-dependent. No bootstrap quantiles or calibrated prediction intervals are produced.",
            "No engine outputs, liveweight values, model predictions, parameter fitting, or motor-versus-DMI metrics are used.",
            "DMI contains 97 missing animal-day values; they are excluded without imputation.",
        ],
        "reproduction": "python3 scripts/analyze_mendeley_nellore_dmi_sequential_partition.py",
    }


def render_markdown(report: dict) -> str:
    analysis = report["analysis"]
    lines = [
        "# Observed daily DMI variability: Nellore feedlot cohort", "",
        "This is a separate descriptive analysis for the observed feedlot cohort. It does not validate pasture DMI, the Riose engine, or individual predictions.", "",
        "## Cohort and source", "",
        f"- Population: {report['population']['category']} ({report['population']['species']}) in a {report['population']['system']}; {report['population']['treatments']}.",
        f"- Outcome: {report['outcome']['name']} in **{report['outcome']['unit']}**.",
        f"- Source: [Mendeley Data DOI {report['source']['doi']}](https://doi.org/{report['source']['doi']}), licensed {report['source']['license']}; SHA-256 verified.",
        f"- Observed DMI: {analysis['nObservedAnimalDays']} animal-days, {analysis['nAnimals']} animals, {analysis['nCalendarDays']} dates; {report['source']['missingDmiValuesExcluded']} missing animal-days excluded without imputation.", "",
        "## Sequential descriptive decomposition", "",
        f"Observed mean: {analysis['meanDmiKgPerAnimalDay']:.4f} kg DM/animal/day; sample SD: {analysis['sampleSdDmiKgPerAnimalDay']:.4f}.", "",
        "The sums of squares below are added sequentially in this fixed order: treatment group, animal identity within treatment, calendar date after animal, then remaining animal-day residual. They are a descriptive, order-dependent fixed-effect partition, not estimates of random-effect variance components.", "",
        "| Component | Sum of squares | Share of centered total |", "|---|---:|---:|",
    ]
    for component in analysis["sequentialOls"]["components"]:
        lines.append(f"| `{component['name']}` | {component['sumSquares']:.4f} | {component['shareOfObservedCenteredSumSquares']:.1%} |")
    lines.extend(["", "Treatment-specific summaries are descriptive only:", ""])
    for treatment, values in analysis["byTreatmentDescriptiveOnly"].items():
        lines.append(f"- **{treatment}:** {values['nAnimalDays']} animal-days, {values['animals']} animals, mean {values['meanDmiKgPerAnimalDay']:.4f} kg DM/animal/day (SD {values['sampleSdDmiKgPerAnimalDay']:.4f}).")
    lines.extend(["", "## Interpretation and limits", ""])
    lines.extend(f"- {item}" for item in report["scientificLimitations"])
    lines.extend(["", "## Reproduction", "", "```bash", report["reproduction"], "python3 -m unittest discover -s tests -p 'test_mendeley_nellore_dmi_sequential_partition.py' -v", "```", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-write", action="store_true", help="print JSON without updating report files")
    args = parser.parse_args()
    records, source = load_source()
    report = analyze(records, source)
    serialized = json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if not args.no_write:
        REPORT_JSON.write_text(serialized, encoding="utf-8")
        REPORT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(serialized, end="")


if __name__ == "__main__":
    main()
