#!/usr/bin/env python3
"""Export exact same-animal/same-date observed DMI and weight pairs as JSON."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts/science/source-audits"))
from audit_mendeley_nellore_feedlot import (
    DATA_DIR,
    MANIFEST_PATH,
    WORKBOOK_PATH,
    _data_rows,
    _read_workbook,
)


def excel_date(value: str) -> str:
    return (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()


def export_pairs() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    actual_hash = hashlib.sha256(WORKBOOK_PATH.read_bytes()).hexdigest()
    if actual_hash != manifest["sha256"] or actual_hash != manifest["repository_sha256"]:
        raise ValueError("Mendeley workbook hash does not match its manifest")

    sheets = _read_workbook(WORKBOOK_PATH)
    dmi_rows = _data_rows(sheets["Dry matter intake"])
    weight_rows = _data_rows(sheets["Liveweight"])
    drinking_rows = _data_rows(sheets["Drinking behaviour"])
    treatments: dict[str, set[str]] = {}
    for row in drinking_rows:
        animal = row.get("Animal ID")
        treatment = (row.get("Treatment group") or "").strip()
        if animal and treatment:
            treatments.setdefault(animal, set()).add(treatment)
    if any(len(values) != 1 for values in treatments.values()):
        raise ValueError("Treatment group is inconsistent within an animal")

    dmi_by_pair = {
        (row["Animal ID"], row["Date (dd/mm/yyyy)"]): row.get("Dry matter intake (kg)")
        for row in dmi_rows
        if row.get("Animal ID") and row.get("Date (dd/mm/yyyy)")
    }
    pairs = []
    for row in weight_rows:
        animal, raw_date, weight = row.get("Animal ID"), row.get("Date"), row.get("Liveweight (kg)")
        if not animal or not raw_date or not weight:
            continue
        dmi = dmi_by_pair.get((animal, raw_date))
        if dmi is None:
            continue
        pairs.append({
            "animalId": animal,
            "date": excel_date(raw_date),
            "treatment": next(iter(treatments.get(animal, {"unknown"}))),
            "liveweightKg": float(weight),
            "observedDmiKgPerDay": float(dmi),
        })

    return {
        "sourceSha256": actual_hash,
        "license": manifest["license"],
        "weightRows": len([row for row in weight_rows if row.get("Animal ID") and row.get("Date") and row.get("Liveweight (kg)")]),
        "exactDatePairsWithObservedDmi": len(pairs),
        "pairs": sorted(pairs, key=lambda item: (item["date"], item["animalId"])),
    }


if __name__ == "__main__":
    print(json.dumps(export_pairs(), ensure_ascii=False))
