#!/usr/bin/env python3
"""Audit the public USDA-ARS individual feedlot DMI compilation.

The output is an integrity/coverage report and row export for a frozen,
descriptive engine-component check. It does not fit the engine or estimate
treatment effects.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data/usda-ars-individual-dmi-feedlot"
WORKBOOK = DATA / "supplemental material.xlsx"
MANIFEST = DATA / "manifest.json"
REPORT = ROOT / "docs/evidence/usda-ars-feedlot-dmi-audit.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REQUIRED = {"Experiment", "TAG", "TRT", "int.BW", "av.BW", "ADG", "DMI"}


def _column(reference: str) -> str:
    return "".join(character for character in reference if character.isalpha())


def _workbook_rows(path: Path) -> dict[str, list[dict[str, str | None]]]:
    with ZipFile(path) as archive:
        strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = [
                "".join(part.text or "" for part in entry.findall(".//m:t", NS))
                for entry in root.findall("m:si", NS)
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"].lstrip("/") for item in relationships}
        sheets: dict[str, list[dict[str, str | None]]] = {}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[f"{{{REL_NS}}}id"]]
            sheet_path = target if target.startswith("xl/") else f"xl/{target}"
            root = ET.fromstring(archive.read(sheet_path))
            rows = []
            for row in root.findall(".//m:sheetData/m:row", NS):
                values: dict[str, str | None] = {}
                for cell in row.findall("m:c", NS):
                    raw = cell.find("m:v", NS)
                    value = raw.text if raw is not None else None
                    if cell.attrib.get("t") == "s" and value is not None:
                        value = strings[int(value)]
                    values[_column(cell.attrib["r"])] = value
                rows.append(values)
            sheets[sheet.attrib["name"]] = rows
        return sheets


def _records(rows: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    if not rows:
        raise ValueError("Data sheet is empty")
    headers = {column: value for column, value in rows[0].items() if value}
    return [
        {headers[column]: value for column, value in row.items() if column in headers}
        for row in rows[1:]
    ]


def _number(row: dict[str, str | None], field: str, key: str) -> float:
    raw = row.get(field)
    try:
        value = float(raw) if raw is not None else math.nan
    except ValueError as error:
        raise ValueError(f"Non-numeric {field} for {key}") from error
    if not math.isfinite(value):
        raise ValueError(f"Missing or non-finite {field} for {key}")
    return value


def audit() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    digest = hashlib.sha256(WORKBOOK.read_bytes()).hexdigest()
    if digest != manifest["sha256"] or digest != manifest["repository_sha256"]:
        raise ValueError("Workbook SHA-256 does not match the manifest and repository API")

    sheets = _workbook_rows(WORKBOOK)
    if set(sheets) != {"READ_ME", "All data"}:
        raise ValueError(f"Unexpected workbook sheets: {sorted(sheets)}")
    descriptions = {row.get("Column Name"): row.get("Description") for row in _records(sheets["READ_ME"])}
    rows = _records(sheets["All data"])
    if not rows or not REQUIRED.issubset(rows[0]):
        raise ValueError(f"Missing required columns: {sorted(REQUIRED - set(rows[0] if rows else []))}")

    keys: set[tuple[str, str]] = set()
    audit_rows = []
    by_experiment: dict[str, dict[str, float | int]] = {}
    for row in rows:
        experiment, animal = row.get("Experiment"), row.get("TAG")
        if not experiment or not animal:
            raise ValueError("Missing experiment or animal identifier")
        key = (experiment, animal)
        if key in keys:
            raise ValueError(f"Duplicate experiment/animal key: {key}")
        keys.add(key)
        initial = _number(row, "int.BW", f"{key}")
        average = _number(row, "av.BW", f"{key}")
        adg = _number(row, "ADG", f"{key}")
        dmi = _number(row, "DMI", f"{key}")
        if min(initial, average, dmi) <= 0:
            raise ValueError(f"Non-positive weight or DMI for {key}")
        summary = by_experiment.setdefault(experiment, {"n": 0, "sumDmi": 0.0, "sumAdg": 0.0, "sumAvgWeight": 0.0})
        summary["n"] += 1
        summary["sumDmi"] += dmi
        summary["sumAdg"] += adg
        summary["sumAvgWeight"] += average
        audit_rows.append({
            "experiment": experiment,
            "animalId": animal,
            "treatment": row.get("TRT"),
            "initialWeightKg": initial,
            "averageWeightKg": average,
            "adgKgPerDay": adg,
            "dmiKgPerDay": dmi,
        })

    return {
        "classification": "public_individual_finishing_cattle_dataset_integrity_audit_not_grazing_case_validation",
        "source": {
            "doi": manifest["doi"],
            "articleDoi": manifest["article_doi"],
            "relatedExperiments": manifest["related_experiments"],
            "license": manifest["license"],
            "sha256": digest,
            "sheet": "All data",
            "rowUnit": "individual animal summarized over its finishing experiment",
            "columnDescriptions": descriptions,
        },
        "coverage": {
            "nAnimalExperimentRows": len(audit_rows),
            "nAnimals": len({row["animalId"] for row in audit_rows}),
            "nExperiments": len(by_experiment),
            "uniqueExperimentAnimalKeys": len(keys),
            "byExperiment": {
                name: {
                    "n": int(values["n"]),
                    "meanDmiKgPerDay": values["sumDmi"] / values["n"],
                    "meanAdgKgPerDay": values["sumAdg"] / values["n"],
                    "meanAverageWeightKg": values["sumAvgWeight"] / values["n"],
                }
                for name, values in sorted(by_experiment.items())
            },
        },
        "rows": audit_rows,
        "limitations": [
            "The source compiles three published finishing/feedlot experiments using individual feeding systems; it is not a pasture dataset.",
            "Each row is an animal-level summary, not a daily time series; DMI variability calculations cannot be independently reproduced from this workbook.",
            "The combined file does not document treatment allocation and all experiment-specific measurement protocols in a single data dictionary; use the source articles for those details.",
            "This dataset does not provide pasture state or an intervention-aligned full-engine trajectory, so it cannot validate the approved CPER case or the complete simulator.",
        ],
    }


if __name__ == "__main__":
    report = audit()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("classification", "source", "coverage")}, indent=2))
