#!/usr/bin/env python3
"""Verify and summarize the pinned public Grass-Cast workbooks without merging cohorts."""
from __future__ import annotations

import hashlib
import json
import math
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "usda-grasscast"
REPORT = ROOT / "docs" / "evidence" / "usda-grasscast-audit.json"
DERIVED = DATA / "cper-grouped-observations.json"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def _column(cell_ref: str) -> str:
    match = re.match(r"[A-Z]+", cell_ref)
    if not match:
        raise ValueError(f"Invalid XLSX cell reference: {cell_ref}")
    return match.group(0)


def read_sheet(path: Path, sheet_name: str) -> list[dict[str, str]]:
    """Read a simple worksheet using Python's standard library only."""
    with zipfile.ZipFile(path) as book:
        workbook = ET.fromstring(book.read("xl/workbook.xml"))
        relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relationships}
        sheet = next(
            item for item in workbook.find("m:sheets", NS)
            if item.attrib["name"] == sheet_name
        )
        target = targets[sheet.attrib[f"{{{NS['r']}}}id"]]
        sheet_path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in book.namelist():
            shared = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared_strings = [
                "".join(text.text or "" for text in item.findall(".//m:t", NS))
                for item in shared.findall("m:si", NS)
            ]
        worksheet = ET.fromstring(book.read(sheet_path))
        raw_rows: list[dict[str, str]] = []
        for row in worksheet.findall(".//m:sheetData/m:row", NS):
            values: dict[str, str] = {}
            for cell in row.findall("m:c", NS):
                cell_type = cell.attrib.get("t")
                value = cell.find("m:v", NS)
                text = value.text if value is not None else ""
                if cell_type == "s" and text:
                    text = shared_strings[int(text)]
                elif cell_type == "inlineStr":
                    inline = cell.find("m:is", NS)
                    text = "".join(t.text or "" for t in inline.findall(".//m:t", NS)) if inline is not None else ""
                values[_column(cell.attrib["r"])] = text
            raw_rows.append(values)

    if not raw_rows:
        return []
    headers = raw_rows[0]
    return [
        {headers.get(column, column): value for column, value in row.items()}
        for row in raw_rows[1:]
    ]


def _numeric(values: list[str]) -> list[float]:
    result = []
    for value in values:
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            result.append(number)
    return result


def _years(rows: list[dict[str, str]]) -> list[int]:
    return sorted({int(row["year"]) for row in rows if row.get("year", "").isdigit()})


def _number(value: str) -> float | None:
    values = _numeric([value])
    return values[0] if values else None


def _group_key(row: dict[str, str]) -> tuple[str, str, str]:
    return (
        row.get("site", "").strip(),
        row.get("year", "").strip(),
        row.get("grazing.treatment", "").strip(),
    )


def audit() -> dict:
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    hashes = {}
    for file in manifest["files"]:
        content = (DATA / file["path"]).read_bytes()
        actual = {
            "md5": hashlib.md5(content).hexdigest(),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
        expected = {key: file[key] for key in actual}
        if actual != expected:
            raise ValueError(f"Checksum mismatch for {file['path']}: {actual}")
        hashes[file["path"]] = actual

    weights = read_sheet(DATA / "Cattle_weight_gains.xlsx", "weightall")
    anpp = read_sheet(DATA / "ANPP.xlsx", "ANPP")
    ndvi = read_sheet(DATA / "NDVI.xlsx", "data")
    site_list = read_sheet(DATA / "Grass-Cast_sitelist.xlsx", "sitelist")
    cper_weights = [row for row in weights if row.get("site") == "CPER"]
    cper_anpp = [row for row in anpp if row.get("site") == "CPER"]
    cper_ndvi = [row for row in ndvi if row.get("Site") == "CPER"]
    weight_values = _numeric([row.get("weight_kg_day", "") for row in weights])
    cper_adg_values = _numeric([row.get("weight_kg_day", "") for row in cper_weights])
    weights_by_key = {_group_key(row): row for row in cper_weights}
    anpp_by_key = {_group_key(row): row for row in cper_anpp}
    if len(weights_by_key) != len(cper_weights) or len(anpp_by_key) != len(cper_anpp):
        raise ValueError("Duplicate CPER site/year/treatment key in a source table")
    matched_keys = sorted(weights_by_key.keys() & anpp_by_key.keys(), key=lambda key: (int(key[1]), key[2]))
    group_observations = []
    for key in matched_keys:
        weight = weights_by_key[key]
        forage = anpp_by_key[key]
        group_observations.append({
            "year": int(key[1]),
            "treatment": key[2],
            "grazingDays": _number(weight.get("days", "")),
            "head": _number(weight.get("head", "")),
            "meanAdgKgPerAnimalDay": _number(weight.get("weight_kg_day", "")),
            "adgSdKgPerAnimalDay": _number(weight.get("weight_kg_day_sd", "")),
            "gainKgPerAnimalSeason": _number(weight.get("weight_kg_season", "")),
            "meanGainKgPerHectare": _number(weight.get("weight_kg_ha", "")),
            "aumPerAcre": _number(weight.get("AUM_acre", "")),
            "acresPerHead": _number(weight.get("acre_head", "")),
            "anppKgDMPerHectare": _number(forage.get("ANPP", "")),
            "anppSdKgDMPerHectare": _number(forage.get("ANPP.sd", "")),
        })
    ndvi_observations = sorted(({
        "year": int(row["year"]),
        "satellite": row.get("satellite", ""),
        "baseline": _number(row.get("Baseline", "")),
        "growingSeasonNdvi": _number(row.get("GS", "")),
        "baselineAdjustedGrowingSeasonNdvi": _number(row.get("GScor", "")),
    } for row in cper_ndvi if row.get("year", "").isdigit()), key=lambda row: (row["year"], row["satellite"]))
    DERIVED.write_text(json.dumps({
        "sourceDoi": manifest["source"]["doi"],
        "classification": "observational_group_level_only_not_causal_or_engine_validation",
        "joinKey": ["site=CPER", "year", "grazing.treatment"],
        "observations": group_observations,
        "ndviObservations": ndvi_observations,
    }, indent=2) + "\n", encoding="utf-8")
    component_policies = sorted({
        row.get("Data Policy", "").strip()
        for row in site_list
        if row.get("Abbrev") == "CPER" and row.get("Data Policy", "").strip()
    })

    result = {
        "classification": "public_observational_group_and_site_level_context_only_not_engine_validation",
        "source": {
            **manifest["source"],
            "files": hashes,
        },
        "cattleWeightGains": {
            "sheet": "weightall",
            "rows": len(weights),
            "sites": sorted({row.get("site", "") for row in weights if row.get("site")}),
            "years": [_years(weights)[0], _years(weights)[-1]],
            "grazingTreatments": sorted({row.get("grazing.treatment", "") for row in weights if row.get("grazing.treatment")}),
            "nonmissingMeanDailyGainRows": len(weight_values),
            "missingMeanDailyGainRows": len(weights) - len(weight_values),
            "hasIndividualAnimalIdentifier": False,
            "cper": {
                "rows": len(cper_weights),
                "years": [_years(cper_weights)[0], _years(cper_weights)[-1]],
                "nonmissingMeanDailyGainRows": len(cper_adg_values),
                "treatments": sorted({row.get("grazing.treatment", "") for row in cper_weights if row.get("grazing.treatment")}),
                "duplicateGroupKeysInWeightTable": 0,
            },
        },
        "anpp": {
            "sheet": "ANPP",
            "rows": len(anpp),
            "sites": sorted({row.get("site", "") for row in anpp if row.get("site") and row.get("site") != "NA"}),
            "missingSiteRows": sum(not row.get("site") or row.get("site") == "NA" for row in anpp),
            "years": [_years(anpp)[0], _years(anpp)[-1]],
            "cperRows": len(cper_anpp),
            "duplicateGroupKeysInCperTable": 0,
        },
        "ndvi": {
            "sheet": "data",
            "rows": len(ndvi),
            "cperRows": len(cper_ndvi),
            "cperYears": [_years([{"year": row.get("year", "")} for row in cper_ndvi])[0], _years([{"year": row.get("year", "")} for row in cper_ndvi])[-1]],
        },
        "cperGroupJoin": {
            "key": ["site=CPER", "year", "grazing.treatment"],
            "weightRows": len(cper_weights),
            "anppRows": len(cper_anpp),
            "matchedGroupKeys": len(matched_keys),
            "weightKeysWithoutAnpp": len(weights_by_key.keys() - anpp_by_key.keys()),
            "anppKeysWithoutWeight": len(anpp_by_key.keys() - weights_by_key.keys()),
            "matchedRowsWithBothAdgAndAnpp": sum(
                item["meanAdgKgPerAnimalDay"] is not None and item["anppKgDMPerHectare"] is not None
                for item in group_observations
            ),
            "individualAnimalRecords": False,
            "derivedFile": str(DERIVED.relative_to(ROOT)),
        },
        "cperComponentPoliciesInSiteList": component_policies,
        "interpretation": [
            "The cattle weight workbook contains site/year/treatment summaries, not individual animal records; its head/count columns do not identify animals.",
            "CPER cattle weight and ANPP tables match exactly on site/year/grazing treatment, so they can be inspected as paired group-level observations; they are not paired individual-animal records.",
            "NDVI has no grazing-treatment key and remains a separate site-year time series; it is not joined to group ADG or ANPP.",
            "The source package is CC BY 4.0, while the site list includes component-specific policies that should be checked before any reuse.",
            "This source can add historical context for grazing and forage at CPER and other sites, but cannot validate individual engine outputs, pasture-stock balance, causal treatment effects, or the full engine.",
        ],
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    report = audit()
    summary = {
        "cattleWeightGainRows": report["cattleWeightGains"]["rows"],
        "cattleWeightGainMissing": report["cattleWeightGains"]["missingMeanDailyGainRows"],
        "cperWeightRows": report["cattleWeightGains"]["cper"]["rows"],
        "cperWeightRowsWithGain": report["cattleWeightGains"]["cper"]["nonmissingMeanDailyGainRows"],
        "cperAnppRows": report["anpp"]["cperRows"],
        "cperNdviRows": report["ndvi"]["cperRows"],
        "cperMatchedGroupKeys": report["cperGroupJoin"]["matchedGroupKeys"],
        "cperGroupKeysWithAdgAndAnpp": report["cperGroupJoin"]["matchedRowsWithBothAdgAndAnpp"],
        "classification": report["classification"],
    }
    print(json.dumps(summary, indent=2))
