#!/usr/bin/env python3
"""Integrity audit for the public Mendeley Nellore feedlot workbook.

This validates file provenance and observed-row coverage only. It does not
estimate a shade effect or validate Agroville's pasture simulation engine.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data/mendeley-nellore-feedlot"
MANIFEST_PATH = DATA_DIR / "manifest.json"
WORKBOOK_PATH = DATA_DIR / "Data file.xlsx"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _column(cell_ref: str) -> str:
    return "".join(character for character in cell_ref if character.isalpha())


def _read_workbook(path: Path) -> dict[str, list[dict[str, str | None]]]:
    with ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(part.text or "" for part in entry.findall(".//m:t", NS))
                for entry in strings_root.findall("m:si", NS)
            ]

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"].lstrip("/") for item in relationships}
        sheets: dict[str, list[dict[str, str | None]]] = {}
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            target = targets[sheet.attrib[f"{{{REL_NS}}}id"]]
            sheet_path = target if target.startswith("xl/") else f"xl/{target}"
            root = ET.fromstring(archive.read(sheet_path))
            rows: list[dict[str, str | None]] = []
            for row in root.findall(".//m:sheetData/m:row", NS):
                values: dict[str, str | None] = {}
                for cell in row.findall("m:c", NS):
                    raw = cell.find("m:v", NS)
                    value = raw.text if raw is not None else None
                    if cell.attrib.get("t") == "s" and value is not None:
                        value = shared_strings[int(value)]
                    values[_column(cell.attrib["r"])] = value
                rows.append(values)
            sheets[sheet.attrib["name"]] = rows
        return sheets


def _data_rows(rows: list[dict[str, str | None]]) -> list[dict[str, str | None]]:
    if not rows:
        raise ValueError("Workbook sheet is empty")
    header = rows[0]
    columns = {column: value for column, value in header.items() if value}
    return [
        {columns[column]: value for column, value in row.items() if column in columns}
        for row in rows[1:]
    ]


def _number(value: str | None, label: str) -> float:
    try:
        result = float(value) if value is not None else math.nan
    except ValueError as error:
        raise ValueError(f"Non-numeric {label} in source workbook") from error
    if not math.isfinite(result):
        raise ValueError(f"Missing or non-finite {label} in source workbook")
    return result


def audit() -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    actual_hash = hashlib.sha256(WORKBOOK_PATH.read_bytes()).hexdigest()
    if actual_hash != manifest["sha256"] or actual_hash != manifest["repository_sha256"]:
        raise ValueError("Workbook SHA-256 does not match the manifest or repository checksum")

    sheets = _read_workbook(WORKBOOK_PATH)
    required_sheets = {"Data description", "Drinking behaviour", "Dry matter intake", "Liveweight", "Weather"}
    if set(sheets) != required_sheets:
        raise ValueError(f"Unexpected workbook sheets: {sorted(sheets)}")

    dmi = _data_rows(sheets["Dry matter intake"])
    weights = _data_rows(sheets["Liveweight"])
    drinking = _data_rows(sheets["Drinking behaviour"])
    weather = _data_rows(sheets["Weather"])

    dmi_pairs: set[tuple[str, str]] = set()
    dmi_animals: set[str] = set()
    dmi_days: set[str] = set()
    valid_dmi = 0
    for row in dmi:
        animal = row.get("Animal ID")
        day = row.get("Date (dd/mm/yyyy)")
        value = row.get("Dry matter intake (kg)")
        if animal and day:
            pair = (animal, day)
            if pair in dmi_pairs:
                raise ValueError("Duplicate animal-day key in DMI records")
            dmi_pairs.add(pair)
            dmi_animals.add(animal)
            dmi_days.add(day)
            if value is not None:
                if _number(value, "DMI") < 0:
                    raise ValueError("Negative DMI value in source workbook")
                valid_dmi += 1

    weight_pairs: set[tuple[str, str]] = set()
    weight_animals: set[str] = set()
    weight_date_counts: Counter[str] = Counter()
    for row in weights:
        animal, day, value = row.get("Animal ID"), row.get("Date"), row.get("Liveweight (kg)")
        if animal and day and value is not None:
            pair = (animal, day)
            if pair in weight_pairs:
                raise ValueError("Duplicate animal-date key in weight records")
            if _number(value, "liveweight") <= 0:
                raise ValueError("Non-positive liveweight in source workbook")
            weight_pairs.add(pair)
            weight_animals.add(animal)
            weight_date_counts[day] += 1

    drinking_rows = [row for row in drinking if row.get("Animal ID") and row.get("Date and time of observation")]
    groups_by_animal: dict[str, set[str]] = defaultdict(set)
    treatment_label_counts: Counter[str] = Counter()
    for row in drinking_rows:
        animal = row["Animal ID"]
        group = (row.get("Treatment group") or "").strip()
        group_id = (row.get("Treatment group ID") or "").strip()
        if group not in {"Shade", "No shade"} or group_id not in {"+S", "-S"}:
            raise ValueError("Unexpected treatment label in drinking observations")
        expected_id = "+S" if group == "Shade" else "-S"
        if group_id != expected_id:
            raise ValueError("Treatment group and shorthand disagree")
        groups_by_animal[animal].add(group)
        treatment_label_counts[group] += 1
        for column in ("Duration of water intake (hh:mm:ss)", "Volume of water intake (L)", "Rate of water in take (L/m)"):
            if _number(row.get(column), column) < 0:
                raise ValueError(f"Negative {column} in source workbook")

    if any(len(groups) != 1 for groups in groups_by_animal.values()):
        raise ValueError("An animal has inconsistent treatment labels")
    group_animal_counts = Counter(next(iter(groups)) for groups in groups_by_animal.values())

    weather_times: list[str] = []
    weather_value_counts: Counter[str] = Counter()
    for row in weather:
        timestamp = row.get("Date and time of recording")
        if not timestamp:
            continue
        weather_times.append(timestamp)
        for column in ("Air temperature (°C)", "Relative humidity (%)", "Wind speed (m/s)", "Solar radiation (w/m2)", "THI"):
            if row.get(column) is not None:
                _number(row[column], column)
                weather_value_counts[column] += 1

    if len(dmi_pairs) != 47 * 82 or len(dmi_animals) != 47 or len(dmi_days) != 82:
        raise ValueError("DMI workbook does not contain the expected 47 × 82 animal-day grid")
    if len(weight_pairs) != 47 * 6 or len(weight_animals) != 47 or set(weight_date_counts.values()) != {47}:
        raise ValueError("Liveweight sheet does not contain six complete measurements for each of 47 animals")
    if len(drinking_rows) != 19_388 or len(groups_by_animal) != 47:
        raise ValueError("Drinking event coverage differs from the published dataset description")
    if len(weather_times) != 7_968:
        raise ValueError("Weather coverage differs from the published dataset description")

    return {
        "source": {
            "doi": manifest["doi"],
            "articleDoi": manifest["article_doi"],
            "license": manifest["license"],
            "sha256Verified": True,
        },
        "coverage": {
            "animals": 47,
            "dmiAnimalDayPairs": len(dmi_pairs),
            "dmiObservedValues": valid_dmi,
            "dmiMissingValuesAmongAnimalDayPairs": len(dmi_pairs) - valid_dmi,
            "dmiBlankTrailingRows": len(dmi) - len(dmi_pairs),
            "dmiDays": len(dmi_days),
            "duplicateDmiAnimalDays": 0,
            "liveweightRows": len(weight_pairs),
            "liveweightDates": len(weight_date_counts),
            "duplicateAnimalDateWeights": 0,
            "drinkingEvents": len(drinking_rows),
            "groupAnimals": dict(sorted(group_animal_counts.items())),
            "treatmentLabelsNormalizedByTrim": True,
            "weatherRows": len(weather_times),
            "weatherUniqueTimestamps": len(set(weather_times)),
            "duplicateWeatherTimestamps": len(weather_times) - len(set(weather_times)),
            "weatherObservedValues": dict(sorted(weather_value_counts.items())),
        },
        "interpretation": {
            "engineValidation": False,
            "primaryUse": "separate descriptive exploration of an adult Nellore feedlot study",
            "limitation": "This cohort is a controlled feedlot study, not the approved USDA/CPER observational grazing case; it cannot validate the current engine or a pasture-versus-confinement comparison.",
        },
    }


if __name__ == "__main__":
    print(json.dumps(audit(), indent=2, ensure_ascii=False))
