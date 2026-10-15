#!/usr/bin/env python3
"""Integrity and descriptive coverage audit for the open MDPI Angus cow tables.

This reports source coverage only; it does not validate or calibrate Agroville.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import statistics
import zipfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data/mdpi-angus-cow-grazing"
REPORT = ROOT / "docs/evidence/mdpi-angus-cow-grazing-audit.json"
OBSERVATIONS = DATA_DIR / "weight-change-observations.json"
GRAZING_PERIOD_DAYS = 84


def _stats(values: list[float]) -> dict[str, float | int]:
    if not values:
        return {"n": 0}
    return {
        "n": len(values),
        "mean": round(statistics.fmean(values), 6),
        "median": round(statistics.median(values), 6),
        "min": round(min(values), 6),
        "max": round(max(values), 6),
    }


def _read_table(archive: zipfile.ZipFile, filename: str) -> list[dict[str, str]]:
    with archive.open(filename) as stream:
        return list(csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig")))


def audit() -> dict:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    archive_path = DATA_DIR / manifest["archive"]["path"]
    archive_bytes = archive_path.read_bytes()
    sha256 = hashlib.sha256(archive_bytes).hexdigest()
    md5 = hashlib.md5(archive_bytes).hexdigest()
    if (len(archive_bytes) != manifest["archive"]["bytes"]
            or sha256 != manifest["archive"]["sha256"]
            or md5 != manifest["archive"]["md5"]):
        raise ValueError("Supplement archive digest mismatch")

    with zipfile.ZipFile(archive_path) as archive:
        members = {name: info.file_size for name, info in ((i.filename, i) for i in archive.infolist())}
        if set(members) != set(manifest["tables"]):
            raise ValueError(f"Unexpected supplement table list: {sorted(members)}")
        tables = {name: _read_table(archive, name) for name in members}
        for name, rows in tables.items():
            if len(rows) != manifest["tables"][name]["rows"]:
                raise ValueError(f"Unexpected row count for {name}")

    s1 = tables["Table S1.csv"]
    if set(s1[0]) != {"Year", "ID", "RFI_Class", "Age_Class", "Tot_Wt_Ch_kg", "Tot_BCS_Ch"}:
        raise ValueError("Unexpected Table S1 schema")
    cow_season_keys = [(row["Year"], row["ID"]) for row in s1]
    if len(cow_season_keys) != len(set(cow_season_keys)):
        raise ValueError("Duplicate cow-season rows in Table S1")
    rows_by_id = Counter(row["ID"] for row in s1)
    repeated_ids = {animal_id for animal_id, count in rows_by_id.items() if count > 1}
    missing_weight_by_year = Counter(
        row["Year"] for row in s1
        if not row["Tot_Wt_Ch_kg"].strip() or row["Tot_Wt_Ch_kg"].upper() == "NA"
    )
    missing_bcs_by_year = Counter(
        row["Year"] for row in s1
        if not row["Tot_BCS_Ch"].strip() or row["Tot_BCS_Ch"].upper() == "NA"
    )

    age_labels = {"1": "1", "2": "2", "3": "3", "4": "4", "5": "5-7", "6": "8+"}
    by_age: dict[str, dict[str, list[float]]] = {}
    for row in s1:
        if row["Age_Class"] not in age_labels:
            raise ValueError(f"Unexpected age class: {row['Age_Class']}")
        group = by_age.setdefault(age_labels[row["Age_Class"]], {"weightChangeKg": [], "bcsChange": []})
        for column, metric in (("Tot_Wt_Ch_kg", "weightChangeKg"), ("Tot_BCS_Ch", "bcsChange")):
            value = row[column].strip()
            if value and value.upper() != "NA":
                number = float(value)
                if not math.isfinite(number):
                    raise ValueError(f"Non-finite {column}")
                group[metric].append(number)

    age_summary = {}
    for label, values in sorted(by_age.items(), key=lambda item: (float(item[0].split("-")[0].rstrip("+")))):
        selected = [row for row in s1 if age_labels[row["Age_Class"]] == label]
        age_summary[label] = {
            "cowSeasonRows": len(selected),
            "uniqueCowIds": len({row["ID"] for row in selected}),
            "weightChangeKg": _stats(values["weightChangeKg"]),
            "bcsChange": _stats(values["bcsChange"]),
        }

    s2 = tables["Table S2.csv"]
    s3 = tables["Table S3.csv"]
    s4 = tables["Table S4.csv"]
    s5 = tables["Table S5.csv"]
    valid_s3 = [row for row in s3 if row.get("ID") and row.get("Day")]
    age_four_plus_codes = {"4", "5", "6"}
    year_map = {"Y1": "2018", "Y2": "2019"}
    age_four_plus = [row for row in s1 if row["Age_Class"] in age_four_plus_codes]
    if any(row["Year"] not in year_map for row in age_four_plus):
        raise ValueError("Unexpected year in age-4-plus subset")
    age_four_plus_keys = {
        (year_map[row["Year"]], row["ID"])
        for row in age_four_plus
    }
    age_four_plus_ids = Counter(row["ID"] for row in age_four_plus)
    age_four_plus_gps = [
        row for row in valid_s3
        if (row["Year"], row["ID"]) in age_four_plus_keys
    ]
    age_four_plus_gps_keys = {
        (row["Year"], row["ID"])
        for row in age_four_plus_gps
    }
    dmi_forages = any("dmi" in column.lower() for row in s2[:1] for column in row)
    return {
        "source": {
            "articleDoi": manifest["source"]["articleDoi"],
            "license": manifest["source"]["license"],
            "archiveSha256Verified": sha256 == manifest["archive"]["sha256"],
            "archiveMd5Verified": md5 == manifest["archive"]["md5"],
            "archiveBytes": len(archive_bytes),
        },
        "coverage": {
            "s1CowSeasonRows": len(s1),
            "s1UniqueCowIdsAcrossYears": len({row["ID"] for row in s1}),
            "s1IdsPresentInBothYears": len(repeated_ids),
            "s1RowsByYear": dict(sorted(Counter(row["Year"] for row in s1).items())),
            "s1AgeClassSummary": age_summary,
            "ageFourPlusSubset": {
                "ageClasses": ["4", "5-7", "8+"],
                "cowSeasonRows": len(age_four_plus),
                "uniqueCowIds": len(age_four_plus_ids),
                "idsRepeatedAcrossIncludedSeasons": sum(count > 1 for count in age_four_plus_ids.values()),
                "missingWeightChange": sum(not row["Tot_Wt_Ch_kg"].strip() or row["Tot_Wt_Ch_kg"].upper() == "NA" for row in age_four_plus),
                "missingBcsChange": sum(not row["Tot_BCS_Ch"].strip() or row["Tot_BCS_Ch"].upper() == "NA" for row in age_four_plus),
                "gpsCowSeasonRows": len(age_four_plus_gps_keys),
                "gpsUniqueCowIds": len({animal_id for _, animal_id in age_four_plus_gps_keys}),
                "gpsCowDayRows": len(age_four_plus_gps),
                "gpsCoverageNote": "Table S3 GPS measurements cover the final 45 days of the grazing period; these do not span the full 84-day derived ADG horizon.",
            },
            "s1MissingWeightChange": sum(not row["Tot_Wt_Ch_kg"].strip() or row["Tot_Wt_Ch_kg"].upper() == "NA" for row in s1),
            "s1MissingWeightChangeByYear": dict(sorted(missing_weight_by_year.items())),
            "s1MissingBcsChange": sum(not row["Tot_BCS_Ch"].strip() or row["Tot_BCS_Ch"].upper() == "NA" for row in s1),
            "s1MissingBcsChangeByYear": dict(sorted(missing_bcs_by_year.items())),
            "s2SupplementCowDayRows": len(s2),
            "s2UniqueCowIds": len({row["ID"] for row in s2 if row.get("ID")}),
            "s2ContainsForageDmiField": dmi_forages,
            "s3GpsCowDayRowsWithIdAndDate": len(valid_s3),
            "s3UniqueCowIds": len({row["ID"] for row in valid_s3}),
            "s4SpatialUseRows": len(s4),
            "s5CoreAreaRows": len(s5),
        },
        "interpretation": {
            "use": "Separate descriptive reference for pregnant Angus cows in dormant-season grazing, with period body-weight and BCS change and a GPS subset.",
            "adgDerived": True,
            "adgDerivation": {
                "formula": "Tot_Wt_Ch_kg / 84",
                "periodDays": GRAZING_PERIOD_DAYS,
                "periodEvidence": "The article reports body-weight change over the 84-day grazing period (Parsons et al., 2021, Results).",
                "interpretation": "Descriptive average daily weight change derived using the study-level period duration; not a per-animal verified interval, daily time series, or engine prediction.",
                "durationLimitation": "Table S1 has no per-animal start/end dates or observed day counts; 84 days is the period duration reported by the article.",
            },
            "individualForageDmiObserved": False,
            "causalInference": False,
            "validatesEngine": False,
            "limitations": [
                "Cow-season rows repeat some animals across two years and are not 408 independent cows.",
                f"{len(repeated_ids)} published IDs occur in both years; keep both year and ID together when making any split or grouped summary.",
                "Table S1 has five missing weight-change values (all in Y1) and three missing BCS-change values; the article does not explain these missing records.",
                "Supplement intake is distinct from total forage DMI.",
                "Table S3 grazing measurements cover only a GPS subset and the last 45 days of grazing.",
                "The cohort is from Montana and is distinct from USDA/CPER and USDA/CGREC.",
                "The source covers ages 1-10 years, including a one-year age class; do not describe every animal as a mature cow.",
            "Derived ADG is period body-weight change divided by the article-reported 84-day grazing period; Table S1 has no per-animal dates or day counts to verify the interval individually.",
            "The dataset lacks matched costs, pasture-stock balance, and a controlled pasture-versus-confinement comparison."
            ],
        },
    }


if __name__ == "__main__":
    result = audit()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    weight_rows = []
    with zipfile.ZipFile(DATA_DIR / json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))["archive"]["path"]) as archive:
        s1 = _read_table(archive, "Table S1.csv")
    age_labels = {"1": "1", "2": "2", "3": "3", "4": "4", "5": "5-7", "6": "8+"}
    for row in s1:
        weight_rows.append({
            "year": row["Year"],
            "animalId": row["ID"],
            "ageClass": age_labels[row["Age_Class"]],
            "rfiClass": row["RFI_Class"],
            "weightChangeKg": None if not row["Tot_Wt_Ch_kg"].strip() or row["Tot_Wt_Ch_kg"].upper() == "NA" else float(row["Tot_Wt_Ch_kg"]),
            "adgDerivedKgPerDay": None if not row["Tot_Wt_Ch_kg"].strip() or row["Tot_Wt_Ch_kg"].upper() == "NA" else float(row["Tot_Wt_Ch_kg"]) / GRAZING_PERIOD_DAYS,
            "bcsChange": None if not row["Tot_BCS_Ch"].strip() or row["Tot_BCS_Ch"].upper() == "NA" else float(row["Tot_BCS_Ch"]),
        })
    OBSERVATIONS.write_text(json.dumps(weight_rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))
