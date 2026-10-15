#!/usr/bin/env python3
"""Audit the frozen public NANP export for adult beef DMI/ADG coverage.

The NANP export is a research-level compilation. This audit deliberately
checks observation granularity before treating treatment rows as animals.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data/nanp-modeling"
MANIFEST = DATA_DIR / "manifest.json"
ARCHIVE = DATA_DIR / "animal-nutrition-metabolism-2026-10-12.zip"
REPORT = ROOT / "docs/evidence/nanp-database-audit.json"
TABLE_PREFIX = "csv-tables/"
GROUP_KEY = (
    "DataSet", "PubID", "TrialID", "TrtID", "SubjectID",
    "Site_Sample", "Day_Sample", "Time_Sample",
)
TARGET_VARIABLES = ("In_DM", "An_ADG", "An_BW", "An_DaysOnFeed")


def _read_csv(archive: ZipFile, name: str) -> list[dict[str, str]]:
    with archive.open(TABLE_PREFIX + name) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def audit() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    archive_bytes = ARCHIVE.read_bytes()
    archive_hash = hashlib.sha256(archive_bytes).hexdigest()
    if len(archive_bytes) != manifest["archiveBytes"] or archive_hash != manifest["archiveSha256"]:
        raise ValueError("NANP archive does not match its frozen manifest")
    if not archive_bytes.lstrip().startswith(b"PK\x03\x04"):
        raise ValueError("NANP archive is not a ZIP file")

    with ZipFile(ARCHIVE) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError(f"Corrupt member in NANP archive: {corrupt}")
        table_rows = {}
        for name in archive.namelist():
            if name.startswith(TABLE_PREFIX) and name.endswith(".csv"):
                table_rows[name.removeprefix(TABLE_PREFIX)] = len(_read_csv(archive, name.removeprefix(TABLE_PREFIX)))

        performance = _read_csv(archive, "performance.csv")
        target_rows: dict[tuple[str, ...], dict[str, dict[str, str]]] = defaultdict(dict)
        performance_counts = Counter()
        for row in performance:
            dataset = row["DataSet"]
            performance_counts[dataset] += 1
            if dataset != "Beef Digestibility (2019)" or row["VarName"] not in TARGET_VARIABLES:
                continue
            key = tuple(row[field] for field in GROUP_KEY)
            variable = row["VarName"]
            if variable in target_rows[key]:
                raise ValueError(f"Duplicate {variable} record at NANP key {key}")
            target_rows[key][variable] = row

        candidate_groups = {
            key: values for key, values in target_rows.items()
            if {"In_DM", "An_ADG", "An_BW"}.issubset(values)
        }
        subjects = _read_csv(archive, "subjects.csv")
        species_by_key: dict[tuple[str, ...], set[str]] = defaultdict(set)
        for row in subjects:
            if row["DataSet"] != "Beef Digestibility (2019)" or row["VarName"] != "Subj_Species":
                continue
            key = tuple(row[field] for field in GROUP_KEY[:5])
            species_by_key[key].add(row["Varvalue"].strip())

        descriptors = _read_csv(archive, "study_descriptors.csv")
        data_types: dict[tuple[str, str, str], set[str]] = defaultdict(set)
        for row in descriptors:
            if row["DataSet"] == "Beef Digestibility (2019)" and row["VarName"] == "DataType":
                key = (row["DataSet"], row["PubID"], row["TrialID"])
                data_types[key].add(row["VarValue"].strip())

    missing_identity = sum(key[4] in ("", "-") for key in candidate_groups)
    missing_sample_n = sum(
        candidate_groups[key][variable].get("N", "-").strip() in ("", "-")
        for key in candidate_groups for variable in ("In_DM", "An_ADG", "An_BW")
    )
    missing_sem = sum(
        candidate_groups[key][variable].get("SEM", "-").strip() in ("", "-")
        for key in candidate_groups for variable in ("In_DM", "An_ADG", "An_BW")
    )
    beef_groups = sum(
        "Beef" in species_by_key.get(key[:5], set())
        for key in candidate_groups
    )
    treatment_mean_groups = sum(
        "Treatment Means" in data_types.get((key[0], key[1], key[2]), set())
        for key in candidate_groups
    )
    complete_horizon = sum("An_DaysOnFeed" in values for values in candidate_groups.values())

    if len(candidate_groups) != 98 or missing_identity != len(candidate_groups):
        raise ValueError("Unexpected granularity/count in NANP beef DMI/ADG/BW candidate rows")
    if beef_groups != len(candidate_groups) or treatment_mean_groups != len(candidate_groups):
        raise ValueError("NANP candidate groups are not uniformly identified as beef treatment means")
    expected_measure_count = len(candidate_groups) * 3
    if missing_sample_n != expected_measure_count or missing_sem != expected_measure_count:
        raise ValueError("NANP sample-size or SEM availability changed; re-audit before interpretation")

    return {
        "classification": "public_treatment_mean_candidate_not_individual_engine_validation",
        "source": {
            "title": manifest["title"],
            "catalogUrl": manifest["catalogUrl"],
            "downloadUrl": manifest["downloadUrl"],
            "license": manifest["license"],
            "retrievedAt": manifest["retrievedAt"],
            "archiveBytes": len(archive_bytes),
            "sha256": archive_hash,
            "sha256Verified": True,
            "zipIntegrityVerified": True,
        },
        "coverage": {
            "csvTableRows": table_rows,
            "performanceRowsByDataset": dict(sorted(performance_counts.items())),
            "beefDigestibilityGroupsWithDmiAdgBw": len(candidate_groups),
            "groupsAlsoWithDaysOnFeed": complete_horizon,
            "groupsIdentifiedAsBeef": beef_groups,
            "groupsClassifiedAsTreatmentMeans": treatment_mean_groups,
            "targetVariableNames": list(TARGET_VARIABLES),
            "targetUnits": {"In_DM": "kg/d", "An_ADG": "kg/d", "An_BW": "kg"},
        },
        "granularity": {
            "groupsWithoutSubjectId": missing_identity,
            "targetValuesWithoutN": missing_sample_n,
            "targetValuesWithoutSEM": missing_sem,
            "targetValuesChecked": expected_measure_count,
            "declaredDataType": "Treatment Means",
            "interpretation": "Rows are study-treatment summaries, not independently identified animals.",
        },
        "decision": "Do not use these rows as individual predictions, independent animal folds, or uncertainty calibration. They may support a separately specified treatment-mean benchmarking study after confirming source-study protocols and outcome alignment.",
        "limits": [
            "The target records do not provide usable individual SubjectID, sample size N, SEM, or SED for DMI, ADG, and BW.",
            "The database compiles heterogeneous studies and treatment summaries; rows within a publication/trial are not independent validation units.",
            "This source is not the approved USDA/CPER adult grazing cohort and cannot validate pasture behavior, costs, forage stock, or the pasture-versus-confinement counterfactual.",
            "The catalog carries a U.S. Public Domain label, while the export endpoint is mutable; the archived bytes and retrieval date define this audit snapshot.",
        ],
    }


if __name__ == "__main__":
    report = audit()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
