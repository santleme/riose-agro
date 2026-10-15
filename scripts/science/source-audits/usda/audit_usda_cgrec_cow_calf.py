#!/usr/bin/env python3
"""Audit and normalize the public USDA CGREC cow-calf workbook using stdlib only."""

from collections import Counter, defaultdict
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "data/usda-cgrec-cow-calf/CentralGrasslandsFireForageNAL.xlsx"
MANIFEST = ROOT / "data/usda-cgrec-cow-calf/manifest.json"
OUTPUT = ROOT / "data/usda-cgrec-cow-calf/cow-calf-observations.json"
REPORT = ROOT / "docs/evidence/usda-cgrec-cow-calf-audit.json"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def md5(path):
    digest = hashlib.md5()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_sheet(archive, sheet_paths, shared_strings, name):
    path = sheet_paths[name]
    if not path.startswith("xl/"):
        path = "xl/" + path
    root = ET.fromstring(archive.read(path))
    sheet_rows = []
    for row in root.findall(".//m:sheetData/m:row", NS):
        values = {}
        for cell in row.findall("m:c", NS):
            value = cell.find("m:v", NS)
            if value is None:
                continue
            value = value.text or ""
            if cell.attrib.get("t") == "s":
                value = shared_strings[int(value)]
            column = re.match(r"[A-Z]+", cell.attrib["r"]).group(0)
            values[column] = value
        sheet_rows.append(values)
    if not sheet_rows:
        return []
    headers = sheet_rows[0]
    return [
        {headers[column]: value for column, value in row.items() if column in headers}
        for row in sheet_rows[1:]
    ]


def as_float(value, field, row_number):
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Invalid {field} on source row {row_number}: {value!r}") from error
    if not math.isfinite(number):
        raise ValueError(f"Non-finite {field} on source row {row_number}")
    return number


def summarize(rows, group_fields):
    groups = defaultdict(list)
    for row in rows:
        key = tuple(row[field] for field in group_fields)
        groups[key].append(row)
    summary = []
    for key, values in sorted(groups.items()):
        summary.append({
            **dict(zip(group_fields, key)),
            "nCowCalfYearRows": len(values),
            "nUniqueCows": len({row["cowId"] for row in values}),
            "nUniqueCalves": len({row["calfId"] for row in values}),
            "meanCowAdgKgPerDay": sum(row["cowAdgKgPerDay"] for row in values) / len(values),
            "meanCalfAdgKgPerDay": sum(row["calfAdgKgPerDay"] for row in values) / len(values),
        })
    return summary


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected = manifest["files"][0]["sha256"]
    actual = sha256(SOURCE)
    if actual != expected:
        raise SystemExit(f"SHA-256 mismatch: expected {expected}, got {actual}")
    actual_md5 = md5(SOURCE)
    if actual_md5 != manifest["files"][0]["md5Expected"]:
        raise SystemExit(f"MD5 mismatch: expected {manifest['files'][0]['md5Expected']}, got {actual_md5}")

    with ZipFile(SOURCE) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relation_map = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        sheet_paths = {
            sheet.attrib["name"]: relation_map[sheet.attrib[f"{{{NS['r']}}}id"]]
            for sheet in workbook.find("m:sheets", NS)
        }
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            string_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//m:t", NS))
                for item in string_root.findall("m:si", NS)
            ]
        metadata = read_sheet(archive, sheet_paths, shared_strings, "METADATA")
        rows = read_sheet(archive, sheet_paths, shared_strings, "CowCalfGains18-20")

    required = {"CowID", "CalfID", "AgeClass", "Year", "Treatment", "Pasture", "ADGcowKgD", "ADGcalfKgD"}
    if not rows or not required.issubset(rows[0]):
        raise SystemExit(f"Missing source columns: {required - set(rows[0] if rows else [])}")

    normalized = []
    for index, row in enumerate(rows, start=2):
        if not all(row.get(field) for field in required - {"ADGcowKgD", "ADGcalfKgD"}):
            raise SystemExit(f"Missing identifier/classification on source row {index}")
        if row["AgeClass"] not in {"Young", "Old"}:
            raise SystemExit(f"Unknown AgeClass on source row {index}: {row['AgeClass']}")
        normalized.append({
            "sourceRow": index,
            "cowId": row["CowID"],
            "calfId": row["CalfID"],
            "ageClass": row["AgeClass"],
            "year": int(row["Year"]),
            "treatment": row["Treatment"],
            "pasture": row["Pasture"],
            "cowAdgKgPerDay": as_float(row["ADGcowKgD"], "ADGcowKgD", index),
            "calfAdgKgPerDay": as_float(row["ADGcalfKgD"], "ADGcalfKgD", index),
        })

    if len({(row["year"], row["cowId"]) for row in normalized}) != len(normalized):
        raise SystemExit("Duplicate cow-year rows found in CowCalfGains18-20")

    rows_by_cow = Counter(row["cowId"] for row in normalized)
    class_rows = Counter(row["ageClass"] for row in normalized)
    year_rows = Counter(row["year"] for row in normalized)
    treatment_rows = Counter(row["treatment"] for row in normalized)
    pasture_treatment = defaultdict(set)
    for row in normalized:
        pasture_treatment[row["treatment"]].add(row["pasture"])

    OUTPUT.write_text(json.dumps({
        "sourceTitle": manifest["title"],
        "sourceDoi": manifest["doi"],
        "sourceCitation": manifest["citation"],
        "sourceLicense": manifest["license"]["declared"],
        "sourceLicenseUrl": manifest["license"]["url"],
        "sourceSha256": actual,
        "unit": "cow-calf pair by study year; cows may recur across years",
        "records": normalized,
    }, indent=2) + "\n", encoding="utf-8")

    report = {
        "auditedAt": date.today().isoformat(),
        "classification": "public_usda_cgrec_mature_and_young_cow_grazing_observations_exploratory_not_engine_validation",
        "source": {key: manifest[key] for key in ("title", "doi", "landingPage", "relatedArticle", "citation", "license", "intendedUse")},
        "files": {"workbook": SOURCE.relative_to(ROOT).as_posix(), "md5": actual_md5, "sha256": actual, "normalizedObservations": OUTPUT.relative_to(ROOT).as_posix()},
        "workbook": {"sheets": list(sheet_paths), "cowCalfSheet": "CowCalfGains18-20", "metadataRows": len(metadata)},
        "data": {
            "records": len(normalized),
            "years": dict(sorted(year_rows.items())),
            "ageClassRows": dict(sorted(class_rows.items())),
            "treatmentRows": dict(sorted(treatment_rows.items())),
            "uniqueCows": len(rows_by_cow),
            "cowsRepeatedAcrossYears": sum(count > 1 for count in rows_by_cow.values()),
            "uniqueCalves": len({row["calfId"] for row in normalized}),
            "pasturesByTreatment": {key: len(value) for key, value in sorted(pasture_treatment.items())},
            "missingValues": 0,
            "duplicateCowYearRows": 0,
            "cowAdgKgPerDay": summarize(normalized, ["year", "treatment", "ageClass"]),
        },
        "ageClassDefinition": {
            "Young": "one to three previous calf crops",
            "Old": "four or more previous calf crops; mature in the related peer-reviewed article",
            "source": "related article methods; labels in source workbook are Young/Old",
        },
        "observedTreatmentLabels": dict(sorted(treatment_rows.items())),
        "method": {
            "unitOfObservation": "cow-calf pair by study year",
            "summary": "arithmetic descriptive means only; no p-values, confidence intervals, causal estimate, or engine fit",
            "cowsRepeatAcrossYears": True,
            "treatmentExperimentalUnit": "pasture; treatment comparisons are shown descriptively and not treated as independently replicated animal-level effects",
        },
        "limitations": [
            "This North Dakota Angus cow-calf research herd is an independent exploratory cohort, not the approved primary USDA/CPER case.",
            "The workbook has 859 cow-calf-year rows from 471 unique cow IDs; rows are repeated across years for some cows and are not independent animals.",
            "Grazing treatment is applied at pasture level; animal rows are not independent treatment replicates.",
            "Cow ADG and calf ADG are observed outcomes; this explorer does not estimate intervention effects or attribute differences to treatment.",
            "No individual dry-matter intake or compatible cost and pasture-stock data are present for validating the engine or calibrating prediction intervals.",
            "The dataset page declares CC BY-SA 4.0 and separately states non-commercial research as intended use; keep both metadata statements and the attribution with derivatives.",
            "The workbook metadata dictionary says one of four experimental treatments, while the analyzed cow/calf sheet and related article contain three grazing management labels; this mismatch is retained here rather than silently repaired.",
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(normalized), "uniqueCows": len(rows_by_cow), "repeatedCows": report["data"]["cowsRepeatedAcrossYears"], "report": str(REPORT.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
