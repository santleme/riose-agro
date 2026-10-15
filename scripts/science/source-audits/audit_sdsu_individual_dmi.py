#!/usr/bin/env python3
"""Audit public South Dakota State University individual intake supplement."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import statistics
import zipfile
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data" / "sdsu-individual-dmi"
EVIDENCE = ROOT / "docs" / "evidence" / "sdsu-individual-dmi-audit.json"
DERIVED = DATA / "individual-dmi-derived.csv"
NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
EXCEL_EPOCH = date(1899, 12, 30)
LB_TO_KG = 0.45359237
ARTICLE_COMPLETE_CASE_TAGS = {"167", "224", "235", "263", "313", "336", "387"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_first_sheet(path: Path) -> list[dict[str, object]]:
    """Read simple published XLSX sheets using only Python's standard library."""
    with zipfile.ZipFile(path) as workbook:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            shared = [
                "".join(node.text or "" for node in item.findall(".//m:t", NS))
                for item in root.findall("m:si", NS)
            ]

        book = ET.fromstring(workbook.read("xl/workbook.xml"))
        relationships = ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
        targets = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        sheet = book.find("m:sheets/m:sheet", NS)
        if sheet is None:
            raise ValueError(f"No worksheet in {path}")
        target = targets[sheet.attrib[f"{{{NS['r']}}}id"]].lstrip("/")
        sheet_path = target if target.startswith("xl/") else f"xl/{target}"
        root = ET.fromstring(workbook.read(sheet_path))

        rows: list[dict[str, object]] = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            cells: dict[str, object] = {}
            for cell in row.findall("m:c", NS):
                column = re.match(r"[A-Z]+", cell.attrib["r"])
                if not column:
                    continue
                value_node = cell.find("m:v", NS)
                value: object = None if value_node is None else value_node.text
                if value is not None and cell.attrib.get("t") == "s":
                    value = shared[int(value)]
                elif value is not None:
                    try:
                        number = float(value)
                        value = int(number) if number.is_integer() else number
                    except (TypeError, ValueError):
                        pass
                cells[column.group()] = value
            rows.append(cells)

    if not rows:
        return []
    headers = [str(value).strip() for value in rows[0].values()]
    columns = list(rows[0])
    return [
        {headers[index]: row.get(columns[index]) for index in range(len(columns))}
        for row in rows[1:]
    ]


def excel_date(value: object) -> str | None:
    if value is None:
        return None
    return (EXCEL_EPOCH + timedelta(days=float(value))).isoformat()


def main() -> None:
    intake = read_first_sheet(DATA / "intake.final.xlsx")
    forage = read_first_sheet(DATA / "Forage_Data.xlsx")
    weights = read_first_sheet(DATA / "ScaleWeights.xlsx")

    forage_by_period: dict[str, list[float]] = {}
    forage_by_period_literal: dict[str, list[float]] = {}
    forage_period_raw: dict[str, Counter[str]] = {}
    for row in forage:
        raw_period = str(row["TrialPeriod"])
        key = raw_period.strip()
        forage_by_period.setdefault(key, []).append(float(row["DM_pct"]))
        forage_by_period_literal.setdefault(raw_period, []).append(float(row["DM_pct"]))
        forage_period_raw.setdefault(key, Counter())[raw_period] += 1
    dm_means = {key: statistics.mean(values) for key, values in forage_by_period.items()}
    dm_means_literal = {key: statistics.mean(values) for key, values in forage_by_period_literal.items()}

    weight_index: dict[tuple[str, str], list[float]] = {}
    for row in weights:
        key = (str(row["AnimalTag"]).strip(), str(excel_date(row["Date"])))
        weight_index.setdefault(key, []).append(float(row["Weight"]))

    by_period: dict[str, list[float]] = {}
    screened_by_period: dict[str, list[float]] = {}
    raw_labels: dict[str, Counter[str]] = {}
    source_missing_tags = sum(row["AnimalTag"] is None for row in intake)
    missing_forages = 0
    duplicated_weight_keys = sum(len(values) > 1 for values in weight_index.values())
    selected_rows_without_unique_weight = 0
    selected_rows_with_weight_key = 0
    all_individual_rows_passing_rmd_screen = 0
    selected_rows_passing_rmd_screen = 0
    all_individual_rows_passing_rmd_screen_literal = 0
    selected_rows_passing_rmd_screen_literal = 0
    empty_or_zero_intake = 0
    animal_names = Counter(str(row["AnimalName"]).strip() for row in intake)
    rows_by_record_class: Counter[str] = Counter()
    output_rows: list[dict[str, object]] = []

    for row in intake:
        raw_period = str(row["FeedType"])
        period = raw_period.strip()
        raw_labels.setdefault(period, Counter())[raw_period] += 1
        animal_tag = None if row["AnimalTag"] is None else str(row["AnimalTag"]).strip()
        animal_name = "" if row["AnimalName"] is None else str(row["AnimalName"]).strip()
        if animal_name == "Total":
            record_class = "aggregate_total"
        elif animal_name == "Unknown":
            record_class = "aggregate_unknown"
        elif animal_tag in ARTICLE_COMPLETE_CASE_TAGS:
            record_class = "selected_article_complete_case_animal"
        elif animal_tag is not None:
            record_class = "other_individual_not_in_article_complete_case_cohort"
        else:
            record_class = "missing_animal_tag"
        rows_by_record_class[record_class] += 1
        selected_animal = record_class == "selected_article_complete_case_animal"
        day = excel_date(row["Date"])
        intake_lb = float(row["IntakeLb"])
        if intake_lb == 0:
            empty_or_zero_intake += 1
        passes_normalized_bw_screen: bool | None = None
        screened_dmi_kg: float | None = None

        identified_individual = record_class in {
            "selected_article_complete_case_animal",
            "other_individual_not_in_article_complete_case_cohort",
        }
        dm_pct_all_individuals = dm_means.get(period) if identified_individual else None
        if identified_individual and dm_pct_all_individuals is not None:
            candidate_dmi_lb = intake_lb * dm_pct_all_individuals / 100
        else:
            candidate_dmi_lb = None

        dm_pct = dm_pct_all_individuals if selected_animal else None
        if selected_animal and dm_pct is None:
            missing_forages += 1
            dmi_kg = None
        elif selected_animal:
            dmi_kg = intake_lb * dm_pct / 100 * LB_TO_KG
            by_period.setdefault(period, []).append(dmi_kg)
        else:
            dmi_kg = None

        animal_weight = None
        if identified_individual and animal_tag is not None and day is not None:
            matches = weight_index.get((animal_tag, day), [])
            if len(matches) == 1:
                animal_weight = matches[0]
            elif selected_animal:
                selected_rows_without_unique_weight += 1
            if selected_animal:
                selected_rows_with_weight_key += 1

            if candidate_dmi_lb is not None and len(matches) == 1 and animal_weight > 0:
                candidate_pct_bw = candidate_dmi_lb / animal_weight * 100
                if 1.8 < candidate_pct_bw < 2.5:
                    all_individual_rows_passing_rmd_screen += 1
                    if selected_animal:
                        selected_rows_passing_rmd_screen += 1
                        passes_normalized_bw_screen = True
                        screened_dmi_kg = candidate_dmi_lb * LB_TO_KG
                        screened_by_period.setdefault(period, []).append(screened_dmi_kg)
                elif selected_animal:
                    passes_normalized_bw_screen = False

                literal_dm_pct = dm_means_literal.get(raw_period)
                if literal_dm_pct is not None:
                    literal_pct_bw = intake_lb * literal_dm_pct / 100 / animal_weight * 100
                    if 1.8 < literal_pct_bw < 2.5:
                        all_individual_rows_passing_rmd_screen_literal += 1
                        if selected_animal:
                            selected_rows_passing_rmd_screen_literal += 1

        if selected_animal and animal_tag is not None and day is not None:
            matches = weight_index.get((animal_tag, day), [])
            if len(matches) == 1 and animal_weight is None:
                # A matching weight of zero is not a usable same-day body weight.
                selected_rows_without_unique_weight += 1

        output_rows.append(
            {
                "feed_type_raw": raw_period,
                "feed_period_normalized": period,
                "animal_name_raw": animal_name,
                "animal_tag": animal_tag,
                "record_class": record_class,
                "date": day,
                "intake_as_fed_lb_day": intake_lb,
                "forage_dm_pct_period_mean": None if dm_pct is None else round(dm_pct, 8),
                "derived_dmi_kg_day": None if dmi_kg is None else round(dmi_kg, 8),
                "body_weight_lb_same_day": animal_weight,
                "derived_dmi_pct_body_weight": (
                    None
                    if dmi_kg is None or animal_weight is None or animal_weight == 0
                    else round(dmi_kg / LB_TO_KG / animal_weight * 100, 8)
                ),
                "passes_1_8_to_2_5_pct_bw_screen_after_period_trim": passes_normalized_bw_screen,
                "derived_dmi_kg_day_after_screen": None if screened_dmi_kg is None else round(screened_dmi_kg, 8),
            }
        )

    with DERIVED.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(output_rows[0]))
        writer.writeheader()
        writer.writerows(output_rows)

    dmi_values = [row["derived_dmi_kg_day"] for row in output_rows if row["derived_dmi_kg_day"] is not None]
    screened_dmi_values = [row["derived_dmi_kg_day_after_screen"] for row in output_rows if row["derived_dmi_kg_day_after_screen"] is not None]
    selected_rows = [row for row in output_rows if row["record_class"] == "selected_article_complete_case_animal"]
    report = {
        "source": {
            "article_doi": "10.3389/fvets.2025.1625448",
            "pmcid": "PMC12411203",
            "supplement": "Data_Sheet_1.ZIP",
            "supplement_url": "https://pmc-oa-opendata.s3.amazonaws.com/PMC12411203.1/Data_Sheet_1.ZIP?md5=3df4dd63d52f7df82fdb904d823328bb",
            "license": "CC BY",
            "supplement_md5": "3df4dd63d52f7df82fdb904d823328bb",
            "supplement_sha256": "655c37fa00030b55cc80029349f2cbf6594eb341ad3b495c24dc0dfbdb70977c",
            "downloaded_components_sha256": {
                path.name: sha256(path)
                for path in sorted(DATA.glob("*.xlsx"))
            },
        },
        "coverage": {
            "intake_rows": len(intake),
            "forage_dm_samples": len(forage),
            "scale_weight_rows": len(weights),
            "animals_in_intake_with_tag": len({row["AnimalTag"] for row in intake if row["AnimalTag"] is not None}),
            "animals_with_weight": len({row["AnimalTag"] for row in weights}),
            "article_complete_case_tags_from_published_rmd": sorted(ARTICLE_COMPLETE_CASE_TAGS),
            "article_complete_case_tags_found": sorted({row["animal_tag"] for row in selected_rows}),
            "selected_complete_case_intake_rows": len(selected_rows),
            "rows_by_record_class": dict(sorted(rows_by_record_class.items())),
            "intake_dates": [min(row["date"] for row in output_rows), max(row["date"] for row in output_rows)],
            "feed_period_counts_raw": dict(sorted(Counter(str(row["FeedType"]) for row in intake).items())),
            "forage_dm_mean_pct_by_normalized_period": {
                key: round(value, 6) for key, value in sorted(dm_means.items())
            },
            "dmi_derived_rows": len(dmi_values),
            "dmi_derived_kg_day_range": [round(min(dmi_values), 6), round(max(dmi_values), 6)],
            "selected_complete_case_rows_after_normalized_1_8_to_2_5_pct_bw_screen": len(screened_dmi_values),
            "selected_complete_case_dmi_kg_day_range_after_normalized_screen": [round(min(screened_dmi_values), 6), round(max(screened_dmi_values), 6)],
            "selected_complete_case_dmi_mean_kg_day_by_period_after_normalized_screen": {
                key: round(statistics.mean(values), 6) for key, values in sorted(screened_by_period.items())
            },
            "dmi_mean_kg_day_by_period": {
                key: round(statistics.mean(values), 6) for key, values in sorted(by_period.items())
            },
            "identified_animal_rows_passing_1_8_to_2_5_pct_bw_screen_after_trimming_period_labels": all_individual_rows_passing_rmd_screen,
            "selected_complete_case_rows_passing_1_8_to_2_5_pct_bw_screen_after_trimming_period_labels": selected_rows_passing_rmd_screen,
            "identified_animal_rows_passing_1_8_to_2_5_pct_bw_screen_with_literal_period_labels": all_individual_rows_passing_rmd_screen_literal,
            "selected_complete_case_rows_passing_1_8_to_2_5_pct_bw_screen_with_literal_period_labels": selected_rows_passing_rmd_screen_literal,
        },
        "qualityChecks": {
            "intake_rows_missing_animal_tag_including_group_aggregates": source_missing_tags,
            "selected_complete_case_intake_rows_without_matching_forage_period": missing_forages,
            "intake_rows_with_zero_as_fed_intake": empty_or_zero_intake,
            "duplicate_animal_date_weight_keys_in_source": duplicated_weight_keys,
            "selected_complete_case_rows_without_unique_same_day_weight": selected_rows_without_unique_weight,
            "selected_complete_case_rows_with_tag_and_date_for_weight_lookup": selected_rows_with_weight_key,
            "selected_complete_case_rows_with_unique_same_day_weight": selected_rows_with_weight_key - selected_rows_without_unique_weight,
            "feed_period_whitespace_variants": {
                key: dict(sorted(counts.items()))
                for key, counts in sorted(raw_labels.items())
                if len(counts) > 1 or any(label != label.strip() for label in counts)
            },
            "weight_rows_with_zero_weight": sum(float(row["Weight"]) == 0 for row in weights),
            "dmi_derived_zero_intake_rows": sum(value == 0 for value in dmi_values),
            "dmi_rows_over_60_kg_day_in_selected_article_cohort": sum(value > 60 for value in dmi_values),
            "source_rmd_note": "The authors' R Markdown says its 1.8–2.5% BW filter retains 308 records, then selects tags 167, 224, 235, 263, 313, 336, and 387 and later aggregates to herd level. The local screen reaches 308 identified-animal rows only after trimming trailing whitespace from period labels (197 selected tags); literal period matching yields 259 rows (160 selected tags), and the published R Markdown does not explicitly trim whitespace. This discrepancy is unresolved, so the local DMI derivation does not claim to reproduce the full published pipeline.",
            "animal_name_counts": dict(sorted(animal_names.items())),
        },
        "scope": {
            "use": "Exploratory DMI component audit only for the seven tags selected by the authors' published complete-case R Markdown; DMI is derived from as-fed intake and period-mean forage dry matter.",
            "not_valid_for": [
                "validation of the USDA/CPER grazing ADG case",
                "causal effects of pasture, forage or supplementation",
                "individual prediction validation without a predeclared independent split",
            ],
            "population_and_setting": "Seven non-lactating Angus beef cows in a South Dakota hay-feeding experiment. The derivative is restricted to the seven tags selected in the public R Markdown; group-level Total/Unknown rows and other tagged animals are retained in the CSV as excluded records with blank DMI.",
        },
    }
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report["coverage"], indent=2, ensure_ascii=False))
    print(f"Wrote {DERIVED.relative_to(ROOT)} and {EVIDENCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
