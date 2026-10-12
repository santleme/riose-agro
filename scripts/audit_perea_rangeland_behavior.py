#!/usr/bin/env python3
"""Audit the public Perea et al. timestamped beef-cow behavior sample."""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
OUT = ROOT / "docs/evidence/perea-rangeland-behavior-audit.json"
SOURCE = "https://figshare.com/articles/dataset/Labeled_sensor_dataset_of_beef_cattle_behavior_grazing_desert_rangelands/28801181"
EXPECTED_MD5 = "7cd143e8cccc79a5e159eaa83428529f"
EXPECTED_COLUMNS = ["Breed", "ID", "Time.MTD", "MI", "State", "Behavior"]
BEHAVIORS = {"GR", "WA", "RU", "RE"}
STATES = {"AC", "ST"}


def main():
    raw = DATA.read_bytes()
    md5 = hashlib.md5(raw).hexdigest()
    if md5 != EXPECTED_MD5:
        raise SystemExit(f"source MD5 mismatch: {md5}")
    with DATA.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise SystemExit(f"unexpected columns: {reader.fieldnames}")
        rows = list(reader)

    parsed = []
    by_cow = defaultdict(list)
    invalid = []
    for line, row in enumerate(rows, start=2):
        try:
            timestamp = datetime.strptime(row["Time.MTD"], "%m/%d/%Y %H:%M")
            motion = float(row["MI"])
            if row["Behavior"] not in BEHAVIORS or row["State"] not in STATES or not 0 <= motion <= 30:
                raise ValueError("label or motion index outside documented domain")
            if (row["Behavior"] in {"GR", "WA"}) != (row["State"] == "AC"):
                raise ValueError("state and behavior labels conflict")
            item = {"breed": row["Breed"], "id": row["ID"], "timestamp": timestamp,
                    "motionIndex": motion, "state": row["State"], "behavior": row["Behavior"]}
            parsed.append(item)
            by_cow[(row["Breed"], row["ID"])].append(item)
        except (ValueError, TypeError) as error:
            invalid.append({"line": line, "reason": str(error)})
    duplicate_keys = Counter((r["breed"], r["id"], r["timestamp"]) for r in parsed)
    duplicate_count = sum(n - 1 for n in duplicate_keys.values() if n > 1)
    counts = Counter(r["behavior"] for r in parsed)
    state_counts = Counter(r["state"] for r in parsed)
    breeds = Counter(r["breed"] for r in parsed)
    animals_by_breed = {breed: len({r["id"] for r in parsed if r["breed"] == breed}) for breed in sorted({r["breed"] for r in parsed})}
    dates = [r["timestamp"] for r in parsed]
    per_cow = []
    for (breed, animal_id), observations in sorted(by_cow.items()):
        per_cow.append({
            "breed": breed, "id": animal_id, "observations": len(observations),
            "days": len({r["timestamp"].date().isoformat() for r in observations}),
            "behaviors": dict(Counter(r["behavior"] for r in observations)),
        })
    report = {
        "source": {
            "title": "Labeled sensor dataset of beef cattle behavior grazing desert rangelands",
            "version": 2, "doi": "10.6084/m9.figshare.28801181.v2",
            "url": SOURCE, "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "article": "https://doi.org/10.1016/j.atech.2025.101002",
            "file": DATA.relative_to(ROOT).as_posix(), "bytes": len(raw), "md5": md5,
            "readme": "data/perea-rangeland-behavior/README_V2.txt",
        },
        "audit": {
            "records": len(parsed), "animals": len(by_cow), "daysWithObservations": len({r["timestamp"].date() for r in parsed}),
            "firstTimestampMountainTime": min(dates).isoformat(timespec="minutes"),
            "lastTimestampMountainTime": max(dates).isoformat(timespec="minutes"),
            "motionIndexRange": [min(r["motionIndex"] for r in parsed), max(r["motionIndex"] for r in parsed)],
            "behaviorCounts": dict(counts), "stateCounts": dict(state_counts),
            "duplicateAnimalTimestampKeys": sum(1 for n in duplicate_keys.values() if n > 1),
            "recordsAtRepeatedAnimalTimestamps": duplicate_count, "invalidRows": invalid,
            "observationsByBreed": dict(breeds), "animalsByBreed": animals_by_breed, "perAnimal": per_cow,
        },
        "interpretation": [
            "This is a small annotated sensor sample for behavior exploration, not an ADG, DMI, or weight dataset.",
            "Each row is a one-minute behavior label synchronized with a one-dimensional motion index; labels were reviewed from video. The public file has repeated animal/timestamp keys, which are preserved as published.",
            "Observations cover sampled daylight video sessions, not full 24-hour activity budgets or whole grazing seasons.",
            "The source study reports classification results; this audit does not retrain or validate those models.",
            "Keep this source separate from the adult ADG and grazing analysis using USDA/CPER.",
        ],
    }
    if len(parsed) != 9222 or len(by_cow) != 24 or invalid or duplicate_count != 304:
        raise SystemExit(f"unexpected audit outcome: rows={len(parsed)}, animals={len(by_cow)}, invalid={len(invalid)}, repeated_timestamp_rows={duplicate_count}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(parsed)} rows, {len(by_cow)} cows, {len(invalid)} invalid rows")


if __name__ == "__main__":
    main()
