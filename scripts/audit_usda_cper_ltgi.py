#!/usr/bin/env python3
"""Audit the public USDA-ARS CPER LTGI individual cattle weight dataset."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/usda-cper-ltgi-2000-2019"
SOURCE = DATA / "LTGI_2000-2019_all_weights_published.csv"
DICTIONARY = DATA / "LTGI_2000-2019_data_dictionary.csv"
MANIFEST = DATA / "manifest.json"
REPORT = ROOT / "docs/evidence/usda-cper-ltgi-audit.json"
REQUIRED = {
    "Year", "Pasture", "Treatment", "Type", "Owner", "Tag.Color", "Tag",
    "Season.Days", "on_Weight", "off_Weight", "Gain_shrunk", "ADG_shrunk", "Use.Flag",
}
LB_TO_KG = 0.45359237


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _number(row: dict[str, str], field: str, row_number: int) -> float:
    try:
        value = float(row[field])
    except (ValueError, KeyError) as error:
        raise ValueError(f"Invalid {field} at row {row_number}") from error
    if not math.isfinite(value):
        raise ValueError(f"Missing/non-finite {field} at row {row_number}")
    return value


def audit() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    file_manifest = {item["name"]: item for item in manifest["files"]}
    raw = SOURCE.read_bytes()
    dictionary_raw = DICTIONARY.read_bytes()
    digests = {
        SOURCE.name: {"sha256": hashlib.sha256(raw).hexdigest(), "md5": hashlib.md5(raw).hexdigest()},
        DICTIONARY.name: {"sha256": hashlib.sha256(dictionary_raw).hexdigest(), "md5": hashlib.md5(dictionary_raw).hexdigest()},
    }
    for name, actual in digests.items():
        expected = file_manifest.get(name)
        if not expected or actual["sha256"] != expected["sha256"] or actual["md5"] != expected["repository_md5"]:
            raise ValueError(f"Digest mismatch for {name}")

    rows = _read_csv(SOURCE)
    if not rows or not REQUIRED.issubset(rows[0]):
        raise ValueError(f"Missing required columns: {sorted(REQUIRED - set(rows[0] if rows else []))}")
    keys: set[tuple[str, ...]] = set()
    normalized = []
    adg_reconciliation_max_abs = 0.0
    for index, row in enumerate(rows, 2):
        key = tuple(row[field] for field in ("Year", "Pasture", "Type", "Owner", "Tag.Color", "Tag"))
        if key in keys:
            raise ValueError(f"Duplicate year/pasture/type/owner/tag key: {key}")
        keys.add(key)
        days = _number(row, "Season.Days", index)
        initial_lb = _number(row, "on_Weight", index)
        final_lb = _number(row, "off_Weight", index)
        gain_shrunk_lb = _number(row, "Gain_shrunk", index)
        adg_shrunk_lb = _number(row, "ADG_shrunk", index)
        if days <= 0 or initial_lb <= 0 or final_lb <= 0:
            raise ValueError(f"Non-positive duration or body weight at row {index}")
        adg_reconciliation_max_abs = max(adg_reconciliation_max_abs, abs(gain_shrunk_lb / days - adg_shrunk_lb))
        normalized.append({
            "rowId": "|".join(key),
            "year": int(row["Year"]),
            "pasture": row["Pasture"],
            "treatment": row["Treatment"],
            "type": row["Type"],
            "owner": row["Owner"],
            "tagColor": row["Tag.Color"],
            "tag": row["Tag"],
            "useFlag": row["Use.Flag"],
            "seasonDays": days,
            "initialWeightKg": initial_lb * LB_TO_KG,
            "finalWeightKg": final_lb * LB_TO_KG,
            "observedRawAdgKgPerDay": (final_lb - initial_lb) * LB_TO_KG / days,
            "observedShrunkAdgKgPerDay": adg_shrunk_lb * LB_TO_KG,
        })

    return {
        "classification": "public_individual_cper_grazing_weight_integrity_audit",
        "source": {
            "title": manifest["title"],
            "doi": manifest["doi"],
            "version": manifest["version"],
            "license": manifest["license"],
            "sourceUrl": manifest["source_url"],
            "sha256": digests[SOURCE.name]["sha256"],
            "dictionarySha256": digests[DICTIONARY.name]["sha256"],
            "period": "2000–2019",
            "weightUnitSource": "lb",
            "convertedWeightUnit": "kg",
            "rows": len(normalized),
            "rowUnit": "one animal per grazing year/pasture, with entry and exit weights",
            "studyDescription": "British- and continental-breed yearling cattle under light, moderate or heavy grazing; one remaining pasture replicate per treatment.",
        },
        "coverage": {
            "uniqueAnimalSeasonKeys": len(keys),
            "byYear": dict(sorted(Counter(str(row["year"]) for row in normalized).items())),
            "byType": dict(sorted(Counter(row["type"] for row in normalized).items())),
            "byTreatment": dict(sorted(Counter(row["treatment"] for row in normalized).items())),
            "byUseFlag": dict(sorted(Counter(row["useFlag"] for row in normalized).items())),
            "allFinitePositiveWeightsAndDays": True,
            "maxAbsGainToAdgReconciliationLbPerDay": adg_reconciliation_max_abs,
        },
        "units": {
            "initialWeight": "kg, converted from published lb using 0.45359237 kg/lb",
            "observedRawAdg": "kg/head/day, derived from (off_Weight - on_Weight) / Season.Days",
            "observedShrunkAdg": "kg/head/day, published ADG_shrunk converted from lb/head/day",
        },
        "rows": normalized,
        "limitations": [
            "Only one pasture replication per grazing-intensity treatment remains; do not interpret treatment differences causally.",
            "Rows are one animal-season each, and ear-tag identifiers may be reused between years; the stable evaluation key is year, pasture, type, owner, tag color and tag.",
            "This file contains individual entry/exit weights, not a daily or 28-day weight series, individual DMI, or initial pasture biomass.",
            "The source documents changes in weighing and shrink protocols over time. Raw endpoint ADG is derived for a transparent weight-scale comparison; the published shrunk ADG is also preserved for sensitivity.",
            "The dataset covers CPER yearlings in grazing seasons and does not validate the full engine, costs, DMI, or a pasture-versus-confinement counterfactual.",
        ],
    }


if __name__ == "__main__":
    report = audit()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    temporary_report = REPORT.with_name(f"{REPORT.name}.{os.getpid()}.tmp")
    temporary_report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary_report, REPORT)
    print(json.dumps({key: report[key] for key in ("classification", "source", "coverage", "units")}, indent=2))
