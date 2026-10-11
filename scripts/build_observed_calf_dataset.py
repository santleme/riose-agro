#!/usr/bin/env python3
"""Fetch and normalize the CC0 Zenodo calf trial for the observed-data viewer."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

RECORD_URL = "https://zenodo.org/records/7251167"
FILES = {
    "weights": {
        "name": "FEiC_Weekly_calf_weights_and_ADG.xlsx",
        "url": "https://zenodo.org/api/records/7251167/files/FEiC_Weekly_calf_weights_and_ADG.xlsx/content",
        "md5": "907e097fb94680ec593bbfcd5a060290",
    },
    "intake": {
        "name": "FEiC_Feed_intake_data.xlsx",
        "url": "https://zenodo.org/api/records/7251167/files/FEiC_Feed_intake_data.xlsx/content",
        "md5": "376613a9a35952b601b973138788c025",
    },
}
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def fetch_verified(file_info: dict[str, str], cache_dir: pathlib.Path) -> pathlib.Path:
    path = cache_dir / file_info["name"]
    if not path.exists():
        request = urllib.request.Request(file_info["url"], headers={"User-Agent": "Agroville observed-data prototype"})
        with urllib.request.urlopen(request, timeout=30) as response, path.open("wb") as output:
            output.write(response.read())
    digest = hashlib.md5(path.read_bytes()).hexdigest()
    if digest != file_info["md5"]:
        raise ValueError(f"Checksum MD5 não confere para {path.name}: {digest}")
    return path


def column_index(reference: str) -> int:
    column = 0
    for character in reference:
        if not character.isalpha():
            break
        column = column * 26 + ord(character.upper()) - ord("A") + 1
    return column - 1


def parse_xlsx(path: pathlib.Path) -> dict[str, list[dict[str, str | None]]]:
    """Parse simple data-only worksheets using Python's standard library."""
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels_xml = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rels = {item.attrib["Id"]: item.attrib["Target"] for item in rels_xml}
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings_xml = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//main:t", NS))
                for item in strings_xml.findall("main:si", NS)
            ]

        sheets: dict[str, list[dict[str, str | None]]] = {}
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            target = rels[sheet.attrib[f"{{{NS['rel']}}}id"]]
            target = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
            worksheet = ET.fromstring(archive.read(str(pathlib.PurePosixPath(target))))
            raw_rows: list[list[str | None]] = []
            for row in worksheet.findall(".//main:sheetData/main:row", NS):
                cells: dict[int, str | None] = {}
                for cell in row.findall("main:c", NS):
                    value_node = cell.find("main:v", NS)
                    value = value_node.text if value_node is not None else None
                    if cell.attrib.get("t") == "s" and value is not None:
                        value = shared_strings[int(value)]
                    elif cell.attrib.get("t") == "inlineStr":
                        value = "".join(text.text or "" for text in cell.findall(".//main:t", NS))
                    if value in {"", "NA", "N/A"}:
                        value = None
                    cells[column_index(cell.attrib["r"])] = value
                width = max(cells, default=-1) + 1
                raw_rows.append([cells.get(index) for index in range(width)])

            if not raw_rows:
                sheets[sheet.attrib["name"]] = []
                continue
            headers = [str(item or "").strip() for item in raw_rows[0]]
            records = []
            for row in raw_rows[1:]:
                record = {headers[index]: row[index] if index < len(row) else None for index in range(len(headers))}
                if any(value is not None for value in record.values()):
                    records.append(record)
            sheets[sheet.attrib["name"]] = records
        return sheets


def numeric(value: str | None) -> float | int | None:
    if value is None:
        return None
    parsed = float(value)
    return int(parsed) if parsed.is_integer() else parsed


def build_dataset(cache_dir: pathlib.Path) -> dict:
    cache_dir.mkdir(parents=True, exist_ok=True)
    weight_sheets = parse_xlsx(fetch_verified(FILES["weights"], cache_dir))
    intake_sheets = parse_xlsx(fetch_verified(FILES["intake"], cache_dir))

    weights = []
    for row in weight_sheets["Weekly calf weights"]:
        weights.append({
            "calf": row["Calf"],
            "treatment": row["Treatment"],
            "age_days": numeric(row["Age_days"]),
            "weight_kg": numeric(row["Weight_kg"]),
        })

    intake_sheets_map = {
        "Grain intake": ("grain", "Grain_consumed_dried_g", "g DM/day"),
        "Hay intake": ("hay", "Hay_consumed_dried_g", "g DM/day"),
        "TMR intake": ("tmr", "TMR_consumed_dried_g", "g DM/day"),
        "Water intake": ("water", "Water_consumed_L", "L/day"),
    }
    intake = []
    for sheet_name, (feed, value_column, unit) in intake_sheets_map.items():
        for row in intake_sheets[sheet_name]:
            intake.append({
                "calf": row["Calf"],
                "treatment": row["Treatment"],
                "age_days": numeric(row["Age_days"]),
                "feed": feed,
                "value": numeric(row[value_column]),
                "unit": unit,
            })

    return {
        "source": {
            "title": "Data from: Providing long hay in a novel pipe feeder or a bucket reduces some, but not all abnormal oral behaviors in milk-fed dairy calves",
            "record_url": RECORD_URL,
            "doi": "10.5281/zenodo.7251167",
            "license": "CC0",
            "generated_from": {
                info["name"]: {"md5": info["md5"]}
                for info in FILES.values()
            },
            "measurements_are_observations": True,
        },
        "weights": weights,
        "intake": intake,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=pathlib.Path, default=pathlib.Path("/tmp/agroville-calf-source"))
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("data/observed-calves-zenodo-7251167.json"))
    args = parser.parse_args()
    dataset = build_dataset(args.cache_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Gerado {args.output}: {len(dataset['weights'])} pesos e {len(dataset['intake'])} registros de ingestão.")


if __name__ == "__main__":
    main()
