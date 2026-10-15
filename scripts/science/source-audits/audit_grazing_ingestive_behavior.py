#!/usr/bin/env python3
"""Integrity and scope audit for the public RDG grazing-ruminant dataset."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data" / "grazing-ingestive-behavior-rdgv"
OUTPUT = ROOT / "docs" / "evidence" / "grazing-ingestive-behavior-audit.json"

FILES = {
    "variables": {
        "name": "IngestBehav_1_Variables.tab",
        "sha256": "0d9b2ff8f5259c0311d36fe16942d4daae8d9d5be95665e69d4286bb1dde9df5",
        "repositoryFileId": 198383,
        "repositoryMd5": "5b810d325aadd7f479a69407e734a0dc",
    },
    "data": {
        "name": "IngestBehav_2_Data.tab",
        "sha256": "4ac69343378915122e66c0da4561dba54f3945e62bb30558ed965bc61ffad19e",
        "repositoryFileId": 198386,
        "repositoryMd5": "2b7ea9accdf5ac0961aec5be5dbd688d",
    },
}

MISSING = {"", "n_a", "na", "nan", "null"}
ADULT_CATTLE_TYPES = {"cow", "steer", "heifer", "cattle", "heifers and steer"}
INTAKE_FIELDS = (
    "6_dry_matter_intake_by_bodyweight",
    "6_intake_rate",
    "6_intake_rate_by_bodyweight",
)


def read_tsv(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.reader(source, delimiter="\t"))


def is_present(value: str) -> bool:
    return value.strip().lower() not in MISSING


def main() -> None:
    hashes: dict[str, str] = {}
    for entry in FILES.values():
        path = DATA_DIR / entry["name"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {entry['name']}")
        hashes[entry["name"]] = digest

    variable_rows = read_tsv(DATA_DIR / FILES["variables"]["name"])
    data_rows = read_tsv(DATA_DIR / FILES["data"]["name"])
    if len(variable_rows) != 52 or len(data_rows) < 3:
        raise ValueError("Unexpected header or variable dictionary shape")

    header, units, rows = data_rows[0], data_rows[1], data_rows[2:]
    if len(header) != 51 or any(len(row) != len(header) for row in rows):
        raise ValueError("Unexpected data schema or row width")
    if len(variable_rows) != len(header) + 1:
        raise ValueError("Variable dictionary does not match the data schema")
    variable_header = variable_rows[0]
    variable_index = variable_header.index("variable name")
    dictionary_names = [row[variable_index] for row in variable_rows[1:]]
    schema_mismatches = [
        {"index": index, "dictionaryName": name, "dataHeader": header[index]}
        for index, name in enumerate(dictionary_names)
        if name != header[index]
    ]
    expected_mismatches = [
        {
            "index": 12,
            "dictionaryName": "1_feeding_behaviour_measurement_method",
            "dataHeader": "1_feeding_behaviour_measurement",
        }
    ]
    if schema_mismatches != expected_mismatches:
        raise ValueError(f"Unexpected variable dictionary mismatches: {schema_mismatches}")

    columns = {name: index for index, name in enumerate(header)}
    livestock_counts = Counter(
        row[columns["2_livestock_type"]].strip().lower() for row in rows
    )
    adult_rows = [
        row for row in rows
        if row[columns["2_livestock_type"]].strip().lower() in ADULT_CATTLE_TYPES
    ]
    treatment_counts: Counter[str] = Counter()
    for row in adult_rows:
        for field in INTAKE_FIELDS:
            if is_present(row[columns[field]]):
                treatment_counts[field] += 1

    source_studies = {
        (row[columns["1_authors"]].strip(), row[columns["1_year"]].strip())
        for row in rows
        if is_present(row[columns["1_authors"]])
    }
    experiment_keys = {
        (row[columns["1_authors"]].strip(), row[columns["1_year"]].strip(), row[columns["1_experimentation_id"]].strip())
        for row in rows
        if is_present(row[columns["1_authors"]]) and is_present(row[columns["1_experimentation_id"]])
    }

    report = {
        "source": {
            "datasetDoi": "10.57745/RPDBI6",
            "repository": "Recherche Data Gouv / MoSAR",
            "license": "Etalab Open License 2.0",
            "articleDoi": "10.1016/j.dib.2024.110488",
            "articleScope": "Treatment-level compilation from 90 publications, 199 experiments, and grazing ruminant studies.",
            "localFilesSha256": hashes,
            "repositoryFileIds": {key: value["repositoryFileId"] for key, value in FILES.items()},
            "repositoryPublishedMd5": {key: value["repositoryMd5"] for key, value in FILES.items()},
            "noteOnChecksums": "The repository MD5 values identify its deposited original files; the public Dataverse API serves converted TSV representations, which are pinned locally by SHA-256.",
        },
        "integrity": {
            "dataRows": len(rows),
            "columns": len(header),
            "dictionaryVariables": len(dictionary_names),
            "dictionaryHeaderMismatches": schema_mismatches,
            "uniqueAuthorYearPairs": len(source_studies),
            "uniqueAuthorYearExperimentKeys": len(experiment_keys),
            "livestockTypeCounts": dict(sorted(livestock_counts.items())),
        },
        "adultCattleTreatmentRows": len(adult_rows),
        "adultCattleRowsWithReportedIntakeFields": dict(treatment_counts),
        "intakeUnits": {field: units[columns[field]] for field in INTAKE_FIELDS},
        "limitations": [
            "Rows represent treatment or experimental-condition summaries compiled from papers, not repeated individual-animal-day observations.",
            "The compilation mixes species, production contexts, measurement methods, and study designs; record counts are not independent sample sizes.",
            "The dictionary and data header differ for column 13: the dictionary names it feeding-behaviour measurement method, while the data header omits the final word.",
            "DMI is represented only by intake rate or intake relative to body weight in this schema; there is no aligned individual daily DMI, ADG, or longitudinal weight outcome for the approved CPER case.",
            "This resource supports exploratory inspection of reported grazing and intake behavior only. It does not validate, calibrate, or provide a causal estimate for engine.js or the USDA/CPER adult ADG case.",
        ],
        "validated": False,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({len(rows)} rows, {len(header)} variables)")


if __name__ == "__main__":
    main()
