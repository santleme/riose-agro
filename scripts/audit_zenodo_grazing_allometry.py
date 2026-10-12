#!/usr/bin/env python3
"""Audit the public adult-cow grazing dataset from Pauler et al. (2020)."""

import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "zenodo-grazing-allometry"
MANIFEST = DATA / "manifest.json"
API_METADATA = DATA / "zenodo-record-api-metadata.json"
REPORT = ROOT / "docs" / "evidence" / "zenodo-grazing-allometry-audit.json"
HORIZON_DAYS = 70
PUBLISHED_MEAN_ADG = {"AH": -0.6, "OB": -0.3, "HC": 0.08}


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        return list(reader.fieldnames or []), list(reader)


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    api_metadata = json.loads(API_METADATA.read_text(encoding="utf-8"))
    api_license = api_metadata.get("license", {}).get("id")
    api_file = next(
        (item for item in api_metadata.get("files", []) if item.get("key") == "Zenodo Data Allometry.txt"),
        None,
    )
    if api_metadata.get("doi") != manifest["source"]["doi"]:
        raise SystemExit("Zenodo API evidence DOI does not match the manifest")
    if api_metadata.get("metadataLicenseFieldPath") != "metadata.license.id" or api_metadata.get("topLevelLicense") is not None:
        raise SystemExit("Zenodo API license field path does not match the captured response")
    if api_license != "cc-by-4.0" or manifest["source"].get("license") != "CC-BY-4.0":
        raise SystemExit("Zenodo API license metadata does not match the manifest")
    if not api_file or api_file.get("checksum", "").removeprefix("md5:") != manifest["files"][0]["officialMd5"]:
        raise SystemExit("Zenodo API file metadata does not match the local manifest")
    source_file = manifest["files"][0]
    path = DATA / source_file["path"]
    payload = path.read_bytes()
    sha256 = hashlib.sha256(payload).hexdigest()
    md5 = hashlib.md5(payload).hexdigest()
    if len(payload) != source_file["bytes"] or sha256 != source_file["sha256"]:
        raise SystemExit("Zenodo allometry file does not match the local manifest")
    if md5 != source_file["officialMd5"]:
        raise SystemExit("Zenodo allometry file does not match the repository MD5")

    columns, rows = read_rows(path)
    required = {"Breed", "Age", "Weight_1", "Weight_2", "Speed_mean", "Steps_mean", "Sel_quality_mean"}
    if not required.issubset(columns):
        raise SystemExit(f"Required columns missing: {sorted(required - set(columns))}")
    if len(rows) != 27:
        raise SystemExit(f"Expected 27 rows (9 cows per breed), found {len(rows)}")
    if any(not row["Age"].strip() or not row["Weight_1"].strip() or not row["Weight_2"].strip() for row in rows):
        raise SystemExit("Age and both endpoint weights must be present for every cow")

    by_breed = {}
    for breed in sorted({row["Breed"] for row in rows}):
        animals = [row for row in rows if row["Breed"] == breed]
        adg_values = [
            (float(row["Weight_2"]) - float(row["Weight_1"])) / HORIZON_DAYS
            for row in animals
        ]
        ages = [int(row["Age"]) for row in animals]
        if len(animals) != 9:
            raise SystemExit(f"Expected 9 cows in breed {breed}, found {len(animals)}")
        mean_adg = sum(adg_values) / len(adg_values)
        by_breed[breed] = {
            "nCows": len(animals),
            "ageMonths": {"minimum": min(ages), "maximum": max(ages)},
            "meanAdgKgPerCowDayDerived": mean_adg,
            "minAdgKgPerCowDayDerived": min(adg_values),
            "maxAdgKgPerCowDayDerived": max(adg_values),
            "weightLossCows": sum(value < 0 for value in adg_values),
            "weightGainCows": sum(value > 0 for value in adg_values),
            "publishedArticleMeanAdgKgPerDayRounded": PUBLISHED_MEAN_ADG[breed],
            "absoluteDifferenceFromPublishedRoundedMean": abs(mean_adg - PUBLISHED_MEAN_ADG[breed]),
        }
        if abs(mean_adg - PUBLISHED_MEAN_ADG[breed]) > 0.05:
            raise SystemExit(f"Derived mean for {breed} does not reconcile with the rounded paper summary")

    report = {
        "classification": "public_adult_cow_grazing_observations_derived_adg_exploratory_not_engine_validation",
        "source": {
            "datasetDoi": manifest["source"]["doi"],
            "articleDoi": manifest["source"]["articleDoi"],
            "license": manifest["source"]["license"],
            "licenseSourceField": api_metadata["metadataLicenseFieldPath"],
            "licenseAssessment": "record_metadata_declares_cc_by_4_0; rendered_record_license_field_is_empty; no_independent_legal_review",
            "licenseEvidence": manifest["source"]["licenseEvidence"],
            "metadataApiUrl": manifest["source"]["metadataApiUrl"],
            "recordPageLicenseDisplay": "empty",
            "file": source_file["path"],
            "sha256": sha256,
            "officialMd5": md5,
        },
        "data": {
            "rows": len(rows),
            "columns": len(columns),
            "breeds": by_breed,
            "ageMonths": {"minimum": min(int(row["Age"]) for row in rows), "maximum": max(int(row["Age"]) for row in rows)},
            "horizonDaysAssumedFromArticle": HORIZON_DAYS,
            "adgFormula": "(Weight_2 - Weight_1) / 70; endpoint weights are in kg; period is the 10-week grazing experiment",
            "individualIdentifierAvailable": False,
        },
        "limitations": [
            "The file has no stable individual ID; rows are treated as one row per cow based on the 27-cow study design.",
            "The 70-day denominator is derived from the article's 10-week period; exact per-animal weighing dates are not in the file.",
            "The article does not provide sufficient detail to decompose short-period scale change into tissue gain, gut fill, and hydration.",
            "One alpine Swiss research setting, three breeds, and nine cows per breed do not represent the USDA/CPER cohort or Brazilian production systems.",
            "No individual DMI, cost, or fully aligned engine inputs are provided; this dataset does not validate or calibrate the engine and does not support causal transport.",
        ],
        "interpretation": "Adult-cow observations with individual start/end weight and grazing behavior provide a better public adult-domain reference than yearling-only datasets. Keep this cohort separate from the approved USDA/CPER observational case and use only as exploratory domain evidence.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
