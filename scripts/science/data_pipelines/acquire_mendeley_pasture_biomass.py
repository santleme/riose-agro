#!/usr/bin/env python3
"""Acquire small, license-verified source tables for pasture biomass.

The 1.5 GB Mendeley package also contains three large photo archives. This
pipeline intentionally acquires the measurement workbooks and small spatial
layers only; it records, but does not fetch, imagery unrelated to this
tabular biomass cohort.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "data/mendeley-pasture-biomass"
API_URL = "https://data.mendeley.com/public-api/datasets/nj72kmdj77"
SELECTED_SUFFIXES = (".xlsx", ".shp", ".shx", ".dbf", ".prj", ".cpg")
LICENSE_NAME = "CC BY 4.0"


def sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def request_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "Riose-Open-Scientific-Data/1.0"})
    with urlopen(request, timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"download returned HTTP {response.status}: {url}")
        return response.read()


def main() -> int:
    metadata_bytes = request_bytes(API_URL)
    metadata = json.loads(metadata_bytes)
    if metadata.get("doi", {}).get("id") != "10.17632/nj72kmdj77.1":
        raise RuntimeError("Mendeley API resolved an unexpected DOI")
    if not metadata.get("available"):
        raise RuntimeError("Mendeley dataset is no longer marked available")
    license_meta = metadata.get("data_licence") or {}
    if license_meta.get("short_name") != LICENSE_NAME or license_meta.get("url", "").rstrip("/") != "http://creativecommons.org/licenses/by/4.0":
        raise RuntimeError(f"unexpected data license metadata: {license_meta}")

    raw_dir = DATA_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "source-api-metadata.json").write_bytes(metadata_bytes)
    selected = []
    for item in metadata.get("files", []):
        name = item["filename"]
        details = item.get("content_details") or {}
        suffix = Path(name).suffix.lower()
        selected_file = suffix in SELECTED_SUFFIXES
        record = {
            "name": name,
            "sizeBytes": details.get("size", item.get("size")),
            "sha256": details.get("sha256_hash"),
            "selectedForDownload": selected_file,
            "downloadUrl": details.get("download_url"),
        }
        if selected_file:
            if not record["sha256"] or not record["downloadUrl"]:
                raise RuntimeError(f"missing checksum or download link for {name}")
            output = raw_dir / name
            if output.exists():
                content = output.read_bytes()
            else:
                content = request_bytes(record["downloadUrl"])
                output.write_bytes(content)
            actual = sha256_bytes(content)
            if actual != record["sha256"]:
                output.unlink(missing_ok=True)
                raise RuntimeError(f"SHA-256 mismatch for {name}: {actual} != {record['sha256']}")
            record["retrievedOn"] = date.today().isoformat()
            record["localPath"] = str(output.relative_to(ROOT))
            record["verifiedSha256"] = actual
        else:
            record["retrievedOn"] = None
            record["localPath"] = None
            record["verification"] = "not_downloaded_unneeded_for_tabular_biomass_cohort"
        selected.append(record)

    manifest = {
        "schemaVersion": "1.0.0",
        "source": {
            "title": metadata["name"],
            "publisher": "Mendeley Data",
            "doi": metadata["doi"]["id"],
            "officialUrl": f"https://data.mendeley.com/datasets/{metadata['id']}/1",
            "apiUrl": API_URL,
            "license": LICENSE_NAME,
            "licenseUrl": license_meta["url"],
            "version": metadata.get("version"),
            "published": metadata.get("publish_date"),
            "retrievedOn": date.today().isoformat(),
            "totalArchiveSizeBytes": metadata.get("size"),
            "licensePermission": license_meta.get("description"),
        },
        "population": {
            "species": "mixed pasture vegetation; botanical species composition is not provided for individual samples",
            "breed": None,
            "ageOrPhysiologicalClass": "not applicable; plant/soil sampling records",
            "location": "two farms, western São Paulo State, Brazil",
            "livestockContext": "cattle pasture fields under rotational and traditional management",
            "system": "managed pasture sampling; source includes traditional, fertilized, intensified, and recently reformed fields",
            "animalsObserved": False,
            "animalCategory": "not applicable; observations are forage/soil sample points, not animals",
            "unitOfObservation": "forage sampling point within MODIS pixel / field campaign",
            "timePoints": ["June 2018", "November 2018", "March 2019"],
            "groupKeys": ["farm", "field_or_management", "MODIS_pixel", "sampling_point", "campaign"],
        },
        "measurement": {
            "experimentType": "repeated observational field sampling of pasture biomass under contrasting management",
            "outcomes": ["green forage biomass", "dry forage biomass", "grass height (later campaigns)", "soil properties (separate workbooks)"],
            "targetUnits": "dry_matter_weight_g: g per 0.25 m2 sample; source weight Ton/ha: tonnes/ha; processed target: kg DM/ha",
            "method": "aboveground forage collected from 0.25 m2 sampling areas; separated into green/dry biomass, oven-dried at 65 C for 72 h, and weighed; soil samples analyzed separately",
            "frequency": "three pasture field campaigns; two soil campaigns",
            "missingnessAndDuplicates": "to be reported by processing audit; November/March sampling points substantially repeat across campaigns",
        },
        "use": {
            "eligibleCohorts": ["forage_biomass_and_productivity"],
            "dmiTargetEligible": False,
            "commercialTrainingLicenseCompatible": True,
            "decision": "CONDITIONAL_PENDING_UNIT_AND_DUPLICATE_AUDIT",
            "limitations": [
                "not animal intake or DMI",
                "single Brazilian region and two farms",
                "repeated spatial points across campaigns must remain grouped in validation",
                "photo archives totaling most of the package are not acquired by this tabular pipeline"
            ],
        },
        "files": selected,
        "metadataSnapshot": "data/mendeley-pasture-biomass/source-api-metadata.json",
        "provenance": {
            "apiMetadataSha256": sha256_bytes(metadata_bytes),
            "downloadMethod": "Mendeley public dataset API file URLs; no authentication",
        },
    }
    (DATA_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Acquired {sum(1 for row in selected if row['selectedForDownload'])} selected source files")
    print(f"Recorded {sum(1 for row in selected if not row['selectedForDownload'])} omitted package files in manifest")
    print(f"Manifest: {manifest['source']['officialUrl']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"acquisition failed: {exc}", file=sys.stderr)
        raise
