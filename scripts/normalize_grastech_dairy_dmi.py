#!/usr/bin/env python3
"""Verify and normalize selected open GrASTech spreadsheets using stdlib only."""
import csv
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "grastech-dairy-grazing-dmi"
MANIFEST_PATH = DATA_DIR / "manifest.json"
OUTPUT_PATH = DATA_DIR / "individual-dmi-observations.tsv"
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def column_index(reference):
    letters = re.match(r"[A-Z]+", reference).group(0)
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - ord("A") + 1
    return index - 1


def read_workbook_rows(path):
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = [
                "".join(part.text or "" for part in item.findall(".//main:t", NS))
                for item in shared.findall("main:si", NS)
            ]

        sheets = {}
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            relationship_id = sheet.attrib[f"{{{NS['rel']}}}id"]
            target = targets[relationship_id]
            sheet_path = target if target.startswith("xl/") else f"xl/{target}"
            root = ET.fromstring(archive.read(sheet_path))
            rows = []
            for row_element in root.findall(".//main:sheetData/main:row", NS):
                cells = {}
                for cell in row_element.findall("main:c", NS):
                    value_element = cell.find("main:v", NS)
                    value = value_element.text if value_element is not None else ""
                    if cell.attrib.get("t") == "s" and value:
                        value = strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(part.text or "" for part in cell.findall(".//main:t", NS))
                    cells[column_index(cell.attrib["r"])] = value
                if cells:
                    width = max(cells) + 1
                    rows.append([cells.get(index, "") for index in range(width)])
            if not rows:
                raise ValueError(f"Workbook sheet is empty: {path.name}/{sheet.attrib['name']}")
            headers = rows[0]
            sheets[sheet.attrib["name"]] = [
                {header: row[index] if index < len(row) else "" for index, header in enumerate(headers)}
                for row in rows[1:]
            ]
        return sheets


def number(row, field):
    value = row.get(field, "")
    if value == "":
        return None
    parsed = float(value)
    if not (parsed == parsed and abs(parsed) != float("inf")):
        raise ValueError(f"Non-finite numeric value in {field}: {value}")
    return parsed


def main():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest["datasetDoi"] != "10.57745/GTTJAR" or manifest["license"] != "Etalab Open License 2.0":
        raise ValueError("Unexpected dataset identity/license; review before processing")

    for entry in manifest["sourceFiles"]:
        content = (DATA_DIR / entry["path"]).read_bytes()
        if len(content) != entry["bytes"] or hashlib.sha256(content).hexdigest() != entry["sha256"]:
            raise ValueError(f"SHA-256/size mismatch for {entry['path']}")
        if hashlib.md5(content).hexdigest() != entry["md5"]:
            raise ValueError(f"Repository MD5 mismatch for {entry['path']}")

    treatments = read_workbook_rows(DATA_DIR / "GrASTech_2_Treatments.xlsx")["Treatments"]
    cows = read_workbook_rows(DATA_DIR / "GrASTech_3_Cows.xlsx")["Cows"]
    source = read_workbook_rows(DATA_DIR / "GrASTech_4_CowMeasurements.xlsx")["CowMeasurements"]
    treatment_by_id = {row["Treatment-ID"]: row for row in treatments}
    cow_by_id = {row["Cow-ID"]: row for row in cows}
    keys = set()
    normalized = []
    for row in source:
        treatment = treatment_by_id.get(row["Treatment-ID"])
        cow = cow_by_id.get(row["Cow-ID"])
        if treatment is None or cow is None:
            raise ValueError(f"Unknown treatment/cow reference: {row['Treatment-ID']} / {row['Cow-ID']}")
        if row["Experiment-ID"] != treatment["Experiment-ID"] or row["Experiment-ID"] != cow["Experiment-ID"]:
            raise ValueError("Experiment ID does not match linked treatment/cow")
        if row["Supplementation-level-(kg DM/d)"] != treatment["Supplementation-level-(kg DM/d)"]:
            raise ValueError("Source row disagrees with treatment supplementation lookup")
        # The E2 cow table records a different `Group` classification from the
        # period-level CowMeasurements table. E1, used in this audit, agrees.
        if row["Experiment-ID"] == "E1" and row["Group"] != cow["Group"]:
            raise ValueError("E1 source group disagrees with cow lookup")
        key = row["Experiment-cow-period-ID"]
        if key in keys:
            raise ValueError(f"Duplicate experiment-cow-period: {key}")
        keys.add(key)
        normalized.append({
            "experiment_id": row["Experiment-ID"],
            "group": row["Group"],
            "cow_id": row["Cow-ID"],
            "period_id": row["Period-ID"],
            "treatment_id": row["Treatment-ID"],
            "supplementation_level_kg_dm_day": number(row, "Supplementation-level-(kg DM/d)"),
            "pasture_access_hours_day": number(row, "Access-time-to-pasture-(h/d)"),
            "body_weight_kg": number(row, "Morning-body-weight-(kg)"),
            "grazing_time_minutes_day": number(row, "Grazing-time-(min/d)"),
            "grazing_bouts_day": number(row, "Number-of-grazing-bouts-(bouts/d)"),
            "first_grazing_bout_minutes": number(row, "First-grazing-bout-duration-(min)"),
            "maize_silage_intake_kg_dm_day": number(row, "Ingested-maize-silage-(kg DM/d)"),
            "soybean_meal_intake_kg_dm_day": number(row, "Soyabean-meal-intake-(kg DM/d)"),
            "herbage_intake_kg_dm_day": number(row, "Herbage-intake-(kg DM/d)"),
            "total_intake_kg_dm_day": number(row, "Total-intake-(kg DM/d)"),
        })

    if len(source) != 168 or len(cow_by_id) != 48:
        raise ValueError(f"Unexpected source coverage: {len(source)} cow-periods, {len(cow_by_id)} cows")
    if {row["experiment_id"] for row in normalized} != {"E1", "E2"}:
        raise ValueError("Expected the two published experiments E1 and E2")
    for row in normalized:
        if row["body_weight_kg"] is None or row["total_intake_kg_dm_day"] is None:
            raise ValueError("Missing body weight or total DMI; do not impute")

    columns = list(normalized[0])
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(normalized)
    print(json.dumps({
        "output": str(OUTPUT_PATH.relative_to(ROOT)),
        "rows": len(normalized),
        "uniqueCows": len(cow_by_id),
        "experiments": {key: sum(row["experiment_id"] == key for row in normalized) for key in ("E1", "E2")},
        "duplicateAnimalPeriodKeys": 0,
        "sourceFilesVerified": len(manifest["sourceFiles"]),
    }, indent=2))


if __name__ == "__main__":
    main()
