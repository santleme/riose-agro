#!/usr/bin/env python3
"""Audit the public USDA/CPER daily animal-level grazing snapshot."""

from __future__ import annotations

import csv
from datetime import datetime
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/usda-cper/manifest.json"
REQUIRED_COLUMNS = {
    "Date", "Season", "ADG_INT", "GBD_5min", "GrazeHrs_4sec", "MeanVelo",
    "Pasture", "Year", "Biomass", "DayLengthMinutes", "Eartag",
}


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    entries = {item["path"]: item for item in manifest["files"]}
    verified = {}
    for filename in ("daily.csv", "daily_dict.csv"):
        path = MANIFEST.parent / filename
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = entries[filename]["sha256"]
        if actual != expected:
            raise ValueError(f"SHA-256 mismatch for {path.relative_to(ROOT)}")
        verified[filename] = actual

    with (MANIFEST.parent / "daily.csv").open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        missing = sorted(REQUIRED_COLUMNS - set(reader.fieldnames or []))
        if missing:
            raise ValueError(f"Missing columns: {', '.join(missing)}")
        rows = list(reader)

    if not rows:
        raise ValueError("Daily table has no rows")
    if any(not row["Eartag"].strip() for row in rows):
        raise ValueError("Missing animal identifier in daily table")
    animals = {row["Eartag"].strip() for row in rows}
    animal_days = Counter((row["Eartag"].strip(), row["Date"].strip()) for row in rows)
    duplicates = [key for key, count in animal_days.items() if count > 1]
    if duplicates:
        raise ValueError(f"Duplicate animal-day records: {len(duplicates)}")

    complete = 0
    for row in rows:
        try:
            minutes = float(row["DayLengthMinutes"])
        except (TypeError, ValueError):
            continue
        complete += 1368 <= minutes <= 1512

    dates = sorted(datetime.strptime(row["Date"], "%m/%d/%Y").date() for row in rows)
    print(json.dumps({
        "source": {"doi": manifest["source"]["doi"], "license": manifest["source"]["license"], "verifiedHashes": verified},
        "rows": len(rows),
        "animals": len(animals),
        "paddocks": sorted({row["Pasture"].strip() for row in rows}),
        "dateRange": [dates[0].isoformat(), dates[-1].isoformat()],
        "completeDayRows": complete,
        "partialDayRows": len(rows) - complete,
        "duplicateAnimalDays": 0,
        "uninterpretedSourceCodes": {
            "Season": sorted({row["Season"].strip() for row in rows}),
            "ADG_INT": sorted({row["ADG_INT"].strip() for row in rows}),
            "reason": "The daily dictionary definitions conflict with raw codes and date ranges; neither field is used to join or label daily observations.",
        },
        "dailyAdgOutcomePresent": False,
        "engineValidation": False,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
