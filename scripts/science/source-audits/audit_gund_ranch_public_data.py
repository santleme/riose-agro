#!/usr/bin/env python3
"""Check provenance and suitability of the public Gund Ranch annual dataset."""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "usda-gund-ranch"
REPORT = ROOT / "docs" / "evidence" / "usda-gund-ranch-public-data-screen.json"


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames or [], list(reader)


def main() -> None:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    verified = []
    for item in manifest["files"]:
        content = (DATA / item["path"]).read_bytes()
        observed = {
            "path": item["path"],
            "bytes": len(content),
            "md5": hashlib.md5(content).hexdigest(),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
        if observed["bytes"] != item["bytes"] or observed["md5"] != item["md5"] or observed["sha256"] != item["sha256"]:
            raise SystemExit(f"Source integrity mismatch: {item['path']}")
        verified.append(observed)

    columns, rows = read_csv(DATA / "Gund_Ranch_Data.csv")
    _, dictionary = read_csv(DATA / "Gund_Ranch_DataDictionary.csv")
    years = sorted({row.get("Year", "") for row in rows})
    individual_id_columns = [
        column for column in columns
        if any(token in column.lower() for token in ("animal_id", "cow_id", "tag", "ear_tag", "individual"))
    ]
    adult_individual_outcomes = [
        column for column in columns
        if any(token in column.lower() for token in ("cow_weight", "cow_adg", "cow_gain", "individual_adg", "individual_weight"))
    ]
    annual_herd_fields = [
        column for column in columns
        if any(token in column.lower() for token in ("number total cows", "bred", "open "))
    ]
    calf_summary_fields = [
        column for column in columns
        if any(token in column.lower() for token in ("ave lbs", "price", "number of big", "number of little", "number of hfr"))
    ]
    anomalies = []
    for row in rows:
        if row.get("Year") == "2010" and "2011" in row.get("Wean Start Date", ""):
            anomalies.append({"year": 2010, "field": "Wean Start Date", "value": row["Wean Start Date"], "note": "Value falls outside the row year and conflicts with the declared 2008–2020 annual series; retained as published."})
        if row.get("Year") == "2017":
            anomalies.append({"year": 2017, "field": "Bred / Open", "value": [row.get("Bred"), row.get("Open ")], "note": "Asterisked values are accompanied by a source note about bull issues; not normalized."})

    result = {
        "source": manifest["source"],
        "integrity": {"status": "verified", "files": verified},
        "shape": {"annual_rows": len(rows), "columns": len(columns), "dictionary_rows": len(dictionary), "years": years},
        "available_content": {
            "annual_herd_fields": annual_herd_fields,
            "calf_summary_fields": calf_summary_fields,
            "adult_individual_id_fields": individual_id_columns,
            "adult_individual_weight_or_adg_fields": adult_individual_outcomes,
            "dry_matter_intake_fields": [c for c in columns if "intake" in c.lower() or "dmi" in c.lower()],
        },
        "source_issues": anomalies,
        "decision": {
            "usable_for_approved_adult_adg_grazing_case": False,
            "reason": "This public-domain package is a single-ranch annual rollup. It has herd reproductive counts and group-average calf sale weights/prices, but no individual adult-cow weights/ADG, animal IDs, or DMI. It cannot supply an animal-level split or validate the approved adult ADG/pasture case.",
            "possible_future_use": "A separate descriptive ranch-economics or cow-calf production prototype, subject to explicit scope; do not mix these annual calf outcomes into the current adult ADG dataset.",
        },
        "limitations": [
            "One ranch; yearly summaries are not independent animal observations.",
            "The source contains a visibly inconsistent 2010 weaning-start date and asterisked 2017 counts; these values were preserved and flagged.",
            "The source metadata says no use limitations and identifies the package as U.S. Public Domain; attribution and version provenance are still retained.",
        ],
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Verified {len(verified)} files; {len(rows)} annual rows ({years[0]}–{years[-1]}).")
    print("Decision: public and sourceable, but unsuitable for adult individual ADG validation.")


if __name__ == "__main__":
    main()
