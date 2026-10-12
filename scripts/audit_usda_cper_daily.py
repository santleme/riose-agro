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
    for filename in ("period.csv", "period_dict.csv", "daily.csv", "daily_dict.csv"):
        path = MANIFEST.parent / filename
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        expected = entries[filename]["sha256"]
        if actual != expected:
            raise ValueError(f"SHA-256 mismatch for {path.relative_to(ROOT)}")
        verified[filename] = actual

    with (MANIFEST.parent / "period.csv").open(newline="", encoding="utf-8-sig") as stream:
        period_reader = csv.DictReader(stream)
        period_rows = list(period_reader)
    period_counts = Counter(row["60dADG_INT"].strip() for row in period_rows)
    period_year_interval_counts = Counter(
        (row["Year"].strip(), row["60dADG_INT"].strip()) for row in period_rows
    )

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
    daily_codes = Counter(
        (row["Year"].strip(), row["Season"].strip(), row["ADG_INT"].strip()) for row in rows
    )
    daily_by_year_season = Counter((row["Year"].strip(), row["Season"].strip()) for row in rows)
    daily_year_adgint = Counter((row["Year"].strip(), row["ADG_INT"].strip()) for row in rows)
    period_year_intervals = set(period_year_interval_counts)
    season_keys = set(daily_by_year_season)
    adgint_keys = set(daily_year_adgint)
    season_maps_to_periods = period_year_intervals.issubset(season_keys)
    adgint_maps_to_periods = period_year_intervals.issubset(adgint_keys)
    print(json.dumps({
        "source": {"doi": manifest["source"]["doi"], "license": manifest["source"]["license"], "verifiedHashes": verified},
        "rows": len(rows),
        "studyPeriodRows": len(period_rows),
        "studyPeriodRowsBy60dAdgInterval": dict(sorted(period_counts.items())),
        "studyPeriodRowsByYearAnd60dAdgInterval": {
            f"{year}:{interval}": count for (year, interval), count in sorted(period_year_interval_counts.items())
        },
        "animals": len(animals),
        "paddocks": sorted({row["Pasture"].strip() for row in rows}),
        "dateRange": [dates[0].isoformat(), dates[-1].isoformat()],
        "completeDayRows": complete,
        "partialDayRows": len(rows) - complete,
        "duplicateAnimalDays": 0,
        "uninterpretedSourceCodes": {
            "Season": sorted({row["Season"].strip() for row in rows}),
            "ADG_INT": sorted({row["ADG_INT"].strip() for row in rows}),
            "dailyCodeCombinations": [
                {"year": year, "season": season, "adgInt": adg_int, "rows": count}
                for (year, season, adg_int), count in sorted(daily_codes.items())
            ],
            "periodYearIntervals": [
                {"year": year, "studyPeriod": interval}
                for year, interval in sorted(period_year_intervals)
            ],
            "seasonMapsToStudyPeriod": season_maps_to_periods,
            "adgIntMapsToStudyPeriod": adgint_maps_to_periods,
            "directJoinSupported": season_maps_to_periods and adgint_maps_to_periods,
            "reason": "The daily dictionary definitions conflict with raw codes and date ranges; neither field is used to join or label daily observations.",
        },
        "dailyAdgOutcomePresent": False,
        "engineValidation": False,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
