#!/usr/bin/env python3
"""Normalize Mendeley Brazil pasture biomass workbooks and export Parquet."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data/mendeley-pasture-biomass"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
CAMPAIGNS = {
    "Pasture_ForageBiomass_June2018.xlsx": "2018-06",
    "Pasture_ForageBiomass_November2018.xlsx": "2018-11",
    "Pasture_ForageBiomass_March2019.xlsx": "2019-03",
}
REQUIRED_SOURCE_COLUMNS = ["Farm", "Date", "Code", "Management", "Name", "Pixel", "Point", "weight dry g", "weight Ton/ha"]
ID_COLUMNS = ["farm", "field_code", "pixel_id", "sampling_point_id"]
MEASUREMENT_MAPPING = {
    "Height cm": "sward_height_cm",
    "weight hum g": "fresh_harvest_weight_g",
    "weight hum green g": "fresh_green_weight_g",
    "weight hum other g": "fresh_other_weight_g",
    "weight dry g": "dry_matter_weight_g",
    "weight Ton/ha": "dry_matter_yield_tonnes_ha",
    "Latitude": "latitude_deg",
    "Longitude": "longitude_deg",
    "cattle": "cattle_present_source",
    "Obs": "observation_note_source",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize_campaign(file_name: str, campaign: str) -> tuple[pd.DataFrame, dict[str, object]]:
    path = RAW_DIR / file_name
    source = pd.read_excel(path, sheet_name="Biomass", engine="openpyxl")
    rows_read = len(source)
    source = source.dropna(how="all").copy()
    empty_rows_removed = rows_read - len(source)
    missing_columns = sorted(set(REQUIRED_SOURCE_COLUMNS) - set(source.columns))
    if missing_columns:
        raise ValueError(f"{file_name} lacks expected columns: {missing_columns}")
    if source[REQUIRED_SOURCE_COLUMNS].isna().any(axis=None):
        counts = source[REQUIRED_SOURCE_COLUMNS].isna().sum()
        raise ValueError(f"unexpected missing key/target fields in {file_name}: {counts[counts > 0].to_dict()}")

    frame = pd.DataFrame({
        "campaign": campaign,
        "farm_raw": source["Farm"].astype(str),
        "farm": source["Farm"].astype(str).str.strip(),
        "collection_date": pd.to_datetime(source["Date"], errors="raise").dt.date.astype(str),
        "field_code_raw": source["Code"].astype(str),
        "field_code": source["Code"].astype(str).str.strip(),
        "management_type": source["Management"],
        "field_name": source["Name"].astype(str).str.strip(),
        # Pixel values are numeric in June but include letters/alphanumeric
        # labels in later campaigns; preserve identifiers as source strings.
        "pixel_id": source["Pixel"].astype(str).str.strip(),
        "sampling_point_id": source["Point"].astype(str).str.strip(),
    })
    for source_column, normalized_column in MEASUREMENT_MAPPING.items():
        if source_column in source.columns:
            frame[normalized_column] = source[source_column]
        else:
            frame[normalized_column] = pd.NA

    numeric_columns = [column for column in MEASUREMENT_MAPPING.values() if column not in ("cattle_present_source", "observation_note_source")]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame["dry_matter_yield_kg_dm_ha"] = frame["dry_matter_yield_tonnes_ha"] * 1000.0
    # Each sampled area is 0.25 m². One gram dry matter from that area equals
    # 40 kg/ha, providing a direct arithmetic consistency check on the source.
    derived_from_cut_mass = frame["dry_matter_weight_g"] * 40.0
    delta = (derived_from_cut_mass - frame["dry_matter_yield_kg_dm_ha"]).abs()
    unit_consistency = bool(delta.max(skipna=True) <= 1e-5)
    if not unit_consistency:
        raise ValueError(f"recorded yield is inconsistent with 0.25 m2 dry weight for {file_name}; max delta={delta.max()}")

    duplicate_count = int(frame.duplicated(["campaign", *ID_COLUMNS], keep=False).sum())
    if duplicate_count:
        raise ValueError(f"duplicate campaign sample keys in {file_name}: {duplicate_count} rows")
    audit = {
        "sourceFile": str(path.relative_to(ROOT)),
        "sourceSha256": sha256(path),
        "campaign": campaign,
        "rowsReadIncludingEmptyFormatting": rows_read,
        "emptyRowsRemoved": empty_rows_removed,
        "usableSampleRows": len(frame),
        "missingnessByColumn": {column: int(count) for column, count in frame.isna().sum().items()},
        "withinCampaignDuplicateSampleKeyRows": duplicate_count,
        "spatialSampleGroupCount": int(frame[["farm", "field_code", "pixel_id"]].drop_duplicates().shape[0]),
        "dryWeightToRecordedYieldMaxAbsoluteDeltaKgHa": float(delta.max(skipna=True)),
        "dryMatterUnitConversion": "source tonnes/ha × 1000 = kg DM/ha; independently checked against g from 0.25 m² × 40",
        "limits": [
            "the source contains field/pixel sampling, not animal intake",
            "blank height and wet mass in June are absent measurements, not zeroes",
            "same farm/field/pixel/point locations can recur across campaign dates and must remain grouped in temporal validation",
        ],
    }
    return frame, audit


def main() -> None:
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    frames = []
    campaign_audits = []
    for file_name, campaign in CAMPAIGNS.items():
        frame, audit = normalize_campaign(file_name, campaign)
        frames.append(frame)
        campaign_audits.append(audit)
    result = pd.concat(frames, ignore_index=True)
    source_key = ["campaign", *ID_COLUMNS]
    if result.duplicated(source_key, keep=False).any():
        raise ValueError("cross-campaign normalized row keys are not unique")
    group_key = ["farm", "field_code", "pixel_id", "sampling_point_id"]
    repeated_group_sizes = result.groupby(group_key, dropna=False)["campaign"].nunique()
    output_dir = PROCESSED_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = output_dir / "pasture-biomass-samples-v1.parquet"
    result.to_parquet(parquet_path, index=False, compression="zstd")
    parquet_sha = sha256(parquet_path)

    audit = {
        "schemaVersion": "1.0.0",
        "generatedOn": date.today().isoformat(),
        "sourceDoi": manifest["source"]["doi"],
        "classification": "real_field_observations_for_forage_biomass_module",
        "target": "dry_matter_yield_kg_dm_ha",
        "notDmi": True,
        "totalRows": len(result),
        "uniqueSamplingRows": int(result[source_key].drop_duplicates().shape[0]),
        "withinCampaignDuplicateRows": 0,
        "spatialGroups": int(result[group_key].drop_duplicates().shape[0]),
        "spatialGroupsObservedInMultipleCampaigns": int((repeated_group_sizes > 1).sum()),
        "rowsWithRepeatedSpatialGroup": int(result.duplicated(group_key, keep=False).sum()),
        "campaigns": campaign_audits,
        "aggregateMissingnessByColumn": {column: int(count) for column, count in result.isna().sum().items()},
        "outputs": [{"path": str(parquet_path.relative_to(ROOT)), "rows": len(result), "sha256": parquet_sha, "format": "parquet", "compression": "zstd"}],
        "validationSplitRequirement": "group on farm/field_code/pixel_id/sampling_point_id; random row split would leak repeated locations across campaigns",
        "license": manifest["source"]["license"],
        "limitations": manifest["use"]["limitations"],
    }
    audit_path = output_dir / "quality-report-v1.json"
    audit_path.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest["processedOutputs"] = audit["outputs"]
    manifest["processingReport"] = str(audit_path.relative_to(ROOT))
    manifest["use"]["decision"] = "ELIGIBLE_FOR_SEPARATE_FORAGE_BIOMASS_MODULE; INELIGIBLE_FOR_DMI"
    (DATA_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "rows": audit["totalRows"],
        "spatialGroups": audit["spatialGroups"],
        "multiCampaignSpatialGroups": audit["spatialGroupsObservedInMultipleCampaigns"],
        "parquet": audit["outputs"][0],
        "report": str(audit_path.relative_to(ROOT)),
    }, indent=2))


if __name__ == "__main__":
    main()
