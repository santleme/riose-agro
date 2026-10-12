#!/usr/bin/env python3
"""Audit public USDA HPGRS East Unit cattle weight-gain records."""
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/usda-hpgrs-1982-2022"
MANIFEST = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
SOURCE = DATA / "EastUnit_LTGI.csv"


def number(value):
    value = (value or "").strip()
    if not value or value.upper() == "NA":
        return math.nan
    return float(value)


def main():
    source = next(item for item in MANIFEST["files"] if item["name"] == SOURCE.name)
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise SystemExit("SHA-256 mismatch against local manifest")
    upstream_md5 = source.get("upstreamMd5")
    if upstream_md5 and hashlib.md5(raw).hexdigest() != upstream_md5:
        raise SystemExit("MD5 mismatch against Figshare API")
    with SOURCE.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))

    years = sorted({int(row["Year"]) for row in rows})
    by_year_tag = defaultdict(list)
    for row in rows:
        tag = row["Tag "].strip()
        if tag:
            by_year_tag[(row["Year"], tag)].append(row)
    adg = []
    gain_weight_errors = []
    for row in rows:
        days, gain = number(row["days"]), number(row["gain kg"])
        if math.isfinite(days) and days > 0 and math.isfinite(gain):
            adg.append(gain / days)
        initial, final = number(row["on kg"]), number(row["off kg"])
        if all(math.isfinite(value) for value in (initial, final, gain)):
            gain_weight_errors.append(abs((final - initial) - gain))

    report = {
        "dataset": {"title": MANIFEST["title"], "doi": MANIFEST["doi"], "license": MANIFEST["license"], "sourceFile": SOURCE.name, "sha256Verified": True, "figshareMd5Verified": bool(upstream_md5)},
        "coverage": {"rows": len(rows), "yearsPresent": years, "yearCount": len(years), "yearsWithoutGrazingPerCatalog": [1989, 2000, 2002], "treatmentCounts": dict(sorted(Counter(row["treatment"].strip() for row in rows).items())), "genderRawCounts": dict(sorted(Counter(row["gender"].strip() for row in rows).items()))},
        "identity": {"nonEmptyTagRows": sum(bool(row["Tag "].strip()) for row in rows), "missingTagRows": sum(not row["Tag "].strip() for row in rows), "uniqueNonEmptyTags": len({row["Tag "].strip() for row in rows if row["Tag "].strip()}), "duplicateYearTagGroups": [{"year": year, "tag": tag, "rows": len(group)} for (year, tag), group in by_year_tag.items() if len(group) > 1]},
        "adgKgPerAnimalDay": {"rows": len(adg), "simpleRowMean": sum(adg) / len(adg) if adg else None, "median": sorted(adg)[len(adg)//2] if adg else None, "min": min(adg) if adg else None, "max": max(adg) if adg else None, "calculation": "published gain kg / published days; recomputed here for display/audit only"},
        "weightGainConsistency": {"rowsCompared": len(gain_weight_errors), "exactMatches": sum(error == 0 for error in gain_weight_errors), "differencesWithinOrEqualTo0_1kg": sum(error <= 0.1000001 for error in gain_weight_errors), "maximumDifferenceKg": max(gain_weight_errors) if gain_weight_errors else None, "note": "Source weights have more decimal places than rounded gain; do not treat 0.1 kg differences as unexplained model error."},
        "sourceLimitations": ["USDA catalog says weight-gain outliers beyond ±2 SD of the treatment mean were removed before publication.", "No grazing was conducted in 1989, 2000, or 2002 because of drought, according to catalog metadata.", "The Tag field is empty in many rows and no pasture/plot identifier is included in the CSV; row-level independent-animal or pasture splits cannot be reconstructed for the full dataset.", "The dataset provides entry/exit weight and stocking rate but no individual DMI, forage biomass, current feed cost, or confinement comparator.", "This report describes a dataset; it does not estimate a causal stocking-rate effect or validate engine.js."],
    }
    output = ROOT / "docs/evidence/usda-hpgrs-longterm-audit.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
