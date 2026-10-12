#!/usr/bin/env python3
"""Audit the public USDA CGREC 1989-2015 cattle production table."""
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/usda-cgrec-longterm"
MANIFEST = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
SOURCE = DATA_DIR / "Streeter-ND_1989-2015_compiled.csv"


def number(value):
    value = (value or "").strip().replace("$", "").replace(",", "")
    if not value or value.upper() == "NA":
        return math.nan
    try:
        return float(value)
    except ValueError:
        return math.nan


def main():
    source_meta = next(item for item in MANIFEST["files"] if item["name"] == SOURCE.name)
    raw = SOURCE.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest()
    if sha256 != source_meta["sha256"]:
        raise SystemExit("SHA-256 mismatch for public source file")
    if hashlib.md5(raw).hexdigest() != source_meta["md5_expected"]:
        raise SystemExit("MD5 mismatch against the public Figshare API")

    with SOURCE.open(encoding="cp1252", newline="") as handle:
        rows = list(csv.DictReader(handle))

    fields = ["TAG", "SEX", "PASTURE", "TRT", "INIT_WT", "FINAL_WT", "ADG_DAYS", "ADG", "GROSS_RETURN"]
    missing = {field: sum(not row[field].strip() or row[field].strip().upper() == "NA" for row in rows) for field in fields}
    adg = [number(row["ADG"]) for row in rows]
    adg = [value for value in adg if math.isfinite(value)]
    years = sorted({int(row["YEAR"]) for row in rows if row["YEAR"].isdigit()})
    pasture_count = len({row["PASTURE"].strip() for row in rows if row["PASTURE"].strip() and row["PASTURE"].strip().upper() != "NA"})
    treatments = dict(sorted(Counter(row["TRT"].strip() for row in rows).items()))

    id_groups = defaultdict(list)
    for row in rows:
        if row["TAG"].strip() and row["TAG"].strip().upper() != "NA":
            id_groups[(row["YEAR"], row["TAG"].strip())].append(row["datum"])
    duplicate_tag_years = [{"year": year, "tag": tag, "record_ids": ids} for (year, tag), ids in id_groups.items() if len(ids) > 1]

    formula_errors = []
    formula_checked = 0
    external_steer_rows = []
    for row in rows:
        initial, final, days, observed = (number(row[key]) for key in ("INIT_WT", "FINAL_WT", "ADG_DAYS", "ADG"))
        if all(math.isfinite(value) for value in (initial, final, days, observed)) and days > 0:
            formula_checked += 1
            calculated = (final - initial) / days
            if abs(calculated - observed) > 0.02:
                formula_errors.append({"record_id": row["datum"], "reported_lb_per_day": observed, "computed_lb_per_day": round(calculated, 5)})
        if row["SEX"].strip().lower() in {"steer", "s"} and all(math.isfinite(value) for value in (initial, final, days)) and days > 0:
            try:
                year = int(row["YEAR"])
            except ValueError:
                continue
            external_steer_rows.append({
                "sourceRecordId": row["datum"],
                "year": year,
                "age": row["ANIMAL_AGE"].strip(),
                "sex": row["SEX"].strip(),
                "tag": row["TAG"].strip(),
                "pasture": row["PASTURE"].strip(),
                "treatment": row["TRT"].strip(),
                "seasonDays": days,
                "initialWeightKg": initial / 2.2046226218,
                "finalWeightKg": final / 2.2046226218,
                "observedRawAdgKgPerDay": ((final - initial) / days) / 2.2046226218,
                "sourceReportedAdgKgPerDay": observed / 2.2046226218,
            })

    report = {
        "dataset": {"title": MANIFEST["title"], "doi": MANIFEST["doi"], "license": MANIFEST["license"], "source_file": SOURCE.name, "sha256_verified": True, "public_md5_verified": True},
        "coverage": {"rows": len(rows), "years": years, "unique_nonmissing_tags": len({row["TAG"].strip() for row in rows if row["TAG"].strip() and row["TAG"].strip().upper() != "NA"}), "pastures": pasture_count, "treatment_counts_including_na": treatments},
        "missing_or_na_counts": missing,
        "adg_lb_per_animal_day": {"observed_records": len(adg), "simple_record_mean": round(sum(adg) / len(adg), 5) if adg else None, "min": min(adg) if adg else None, "max": max(adg) if adg else None, "source_unit": "lb/animal/day", "display_conversion": "kg = lb / 2.2046226218"},
        "identity_quality": {"duplicate_tag_year_groups": duplicate_tag_years, "source_line_id_unique": len({row["datum"] for row in rows}) == len(rows)},
        "adg_formula_check": {"formula": "(FINAL_WT - INIT_WT) / ADG_DAYS", "unit": "lb/animal/day", "records_checked": formula_checked, "differences_over_0_02_lb_day": formula_errors},
        "steer_validation_rows": external_steer_rows,
        "interpretation": ["Rows are animal-season records; animals share pastures and management exposures.", "Simple summaries are descriptive and are not treatment-effect estimates.", "The source does not report individual dry matter intake or a confinement comparator.", "One tag is duplicated within 1999 with conflicting record values; retain the source line ID and do not merge by year and tag alone."],
    }
    (ROOT / "docs/evidence/usda-cgrec-longterm-audit.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
