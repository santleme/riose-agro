#!/usr/bin/env python3
"""Download the openly licensed Precision Beef Zenodo cohort with checksums.

Raw files are intentionally ignored by Git; the small provenance manifest is
written to data/precision-beef/manifest.json after every required file passes
the publisher's MD5 checksum.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RECORD_ID = "4064802"
API_URL = f"https://zenodo.org/api/records/{RECORD_ID}"
RAW_DIR = ROOT / "data/raw/zenodo-4064802"
MANIFEST_PATH = ROOT / "data/precision-beef/manifest.json"
METADATA_PATH = ROOT / "data/precision-beef/zenodo-record-4064802.json"
PROCESSING_REPORT_PATH = ROOT / "data/precision-beef/processing-report.json"
EXPECTED_FILES = {"Readme.md"} | {f"accel-{i:02d}.csv" for i in range(1, 19)} | {
    f"halter-{i:02d}.csv" for i in range(1, 19)
}
USER_AGENT = "Riose-open-scientific-data/1.0"
CHUNK_SIZE = 4 * 1024 * 1024
MAX_WORKERS = 4


def validate_record(record: dict[str, Any]) -> dict[str, Any]:
    metadata = record.get("metadata", {})
    license_id = (metadata.get("license") or {}).get("id")
    access = metadata.get("access_right")
    if access != "open" or license_id != "cc-by-4.0":
        raise ValueError(f"Dataset is not verified open CC BY 4.0: access={access!r}, license={license_id!r}")
    listed = {entry.get("key") for entry in record.get("files", [])}
    missing = EXPECTED_FILES - listed
    unexpected = listed - EXPECTED_FILES
    if missing or unexpected:
        raise ValueError(f"Unexpected Zenodo file inventory; missing={sorted(missing)}, extra={sorted(unexpected)}")
    return record


def fetch_record(api_url: str = API_URL) -> dict[str, Any]:
    request = urllib.request.Request(api_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        record = json.load(response)
    return validate_record(record)


def parse_file_entry(entry: dict[str, Any]) -> dict[str, Any]:
    checksum = entry.get("checksum", "")
    if not checksum.startswith("md5:") or not entry.get("links", {}).get("self"):
        raise ValueError(f"File lacks publisher MD5 or direct content URL: {entry.get('key')!r}")
    size = entry.get("size")
    if not isinstance(size, int) or size < 0:
        raise ValueError(f"Invalid byte size for {entry.get('key')!r}")
    return {
        "key": entry["key"],
        "bytes": size,
        "md5": checksum.removeprefix("md5:"),
        "url": entry["links"]["self"],
    }


def digest_file(path: Path) -> tuple[str, str, int]:
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(CHUNK_SIZE):
            md5.update(chunk)
            sha256.update(chunk)
            size += len(chunk)
    return md5.hexdigest(), sha256.hexdigest(), size


def download_one(info: dict[str, Any], retries: int = 3) -> dict[str, Any]:
    key = info["key"]
    destination = RAW_DIR / key
    partial = RAW_DIR / f"{key}.part"
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        got_md5, got_sha256, got_size = digest_file(destination)
        if got_md5 == info["md5"] and got_size == info["bytes"]:
            return {**info, "sha256": got_sha256, "status": "verified_existing"}
        destination.unlink()
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            offset = partial.stat().st_size if partial.exists() else 0
            headers = {"User-Agent": USER_AGENT}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            request = urllib.request.Request(info["url"], headers=headers)
            with urllib.request.urlopen(request, timeout=120) as response:
                status = getattr(response, "status", 200)
                append = offset > 0 and status == 206
                if offset and not append:
                    offset = 0
                mode = "ab" if append else "wb"
                with partial.open(mode) as stream:
                    while chunk := response.read(CHUNK_SIZE):
                        stream.write(chunk)
            got_md5, got_sha256, got_size = digest_file(partial)
            if got_size != info["bytes"] or got_md5 != info["md5"]:
                partial.unlink(missing_ok=True)
                raise ValueError(
                    f"Checksum/size mismatch for {key}: bytes={got_size}, md5={got_md5}; "
                    f"expected bytes={info['bytes']}, md5={info['md5']}"
                )
            os.replace(partial, destination)
            return {**info, "sha256": got_sha256, "status": "downloaded_and_verified"}
        except (OSError, urllib.error.URLError, TimeoutError, ValueError) as error:
            last_error = error
            if attempt < retries:
                time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError(f"Failed to download {key} after {retries} attempts: {last_error}")


def create_manifest(
    record: dict[str, Any],
    verified_files: list[dict[str, Any]],
    metadata_sha256: str,
    retrieved_on: str,
) -> dict[str, Any]:
    metadata = record["metadata"]
    ordered = sorted(verified_files, key=lambda item: item["key"])
    if len(ordered) != len(EXPECTED_FILES) or any(
        item["status"] not in {"downloaded_and_verified", "verified_existing"} for item in ordered
    ):
        raise ValueError("Cannot register a partially downloaded or unchecked source")
    return {
        "schemaVersion": "1.0.0",
        "source": {
            "title": metadata["title"],
            "publisher": "Zenodo",
            "doi": metadata["doi"],
            "officialUrl": record.get("links", {}).get("html"),
            "apiUrl": API_URL,
            "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "version": metadata.get("version", "1"),
            "published": metadata.get("publication_date"),
            "retrievedOn": retrieved_on,
            "totalArchiveSizeBytes": sum(item["bytes"] for item in ordered),
            "licensePermission": "Creative Commons Attribution 4.0 International: reuse and adaptation are allowed with appropriate attribution, a link to the license, and an indication of changes.",
        },
        "population": {
            "species": "Bos taurus",
            "breed": None,
            "ageOrPhysiologicalClass": "finishing steers; exact ages not supplied in the dataset README",
            "location": "Easter Howgate Farm, UK",
            "livestockContext": "18 finishing steers across three farm trials",
            "system": "indoor straw housing with ad libitum total mixed ration",
            "animalsObserved": True,
            "animalCategory": "finishing steers; breed not specified in the dataset README",
            "unitOfObservation": "timestamped 10 Hz sensor row paired to an instrument-derived behavior label",
            "timePoints": ["farm trial 1", "farm trial 2", "farm trial 3"],
            "groupKeys": ["animal_id", "farm_trial", "source_split"],
        },
        "measurement": {
            "experimentType": "observational sensor and behavior-classification dataset from three housed-cattle farm trials",
            "outcomes": ["other", "rumination", "eating_or_drinking"],
            "targetUnits": "acceleration in mg; categorical label codes 0, 1, 2",
            "method": "neck collar 3-axis MEMS accelerometer paired with RumiWatch muzzle halter jaw-pressure classifier; the halter labels are not independent human-video annotations",
            "frequency": "10 Hz for collar and halter records",
            "missingnessAndDuplicates": "Must be audited from downloaded files before modeling; drinking is merged into eating in the published labels. Animal and trial groups must stay intact during evaluation.",
        },
        "use": {
            "eligibleCohorts": ["housed_finishing_steer_sensor_to_instrument_reference_agreement"],
            "dmiTargetEligible": False,
            "commercialTrainingLicenseCompatible": True,
            "decision": "CONDITIONAL_FOR_SEPARATE_HOUSED_STEER_SENSOR_AGREEMENT_TASK; INELIGIBLE_FOR_PASTURE_BEHAVIOR_AND_DMI",
            "limitations": [
                "Housed finishing steers are not grazing beef cows or pasture grazing sessions.",
                "The source-defined test set contains three animals, one from each trial; those animals were already used as a test cohort in the publication.",
                "Labels are instrument-derived and drinking is merged into eating; this is not human-confirmed ethological ground truth.",
                "This cohort cannot validate DMI, ADG, pasture behavior, or the Riose engine.",
            ],
        },
        "files": [
            {
                "name": item["key"],
                "sizeBytes": item["bytes"],
                "sha256": item["sha256"],
                "selectedForDownload": True,
                "downloadUrl": item["url"],
                "retrievedOn": retrieved_on,
                "localPath": f"data/raw/zenodo-{RECORD_ID}/{item['key']}",
                "verifiedSha256": item["sha256"],
                "verification": f"Zenodo publisher MD5 {item['md5']} and local SHA-256 verified",
            }
            for item in ordered
        ],
        "metadataSnapshot": str(METADATA_PATH.relative_to(ROOT)),
        "provenance": {
            "apiMetadataSha256": metadata_sha256,
            "downloadMethod": f"Official Zenodo record API followed by resumable HTTPS downloads with up to {MAX_WORKERS} workers; each file is accepted only after publisher MD5 and local SHA-256 verification.",
        },
        "processedOutputs": [],
        "processingReport": str(PROCESSING_REPORT_PATH.relative_to(ROOT)),
    }


def main() -> int:
    started = time.perf_counter()
    record = fetch_record()
    entries = [parse_file_entry(item) for item in record["files"]]
    total_bytes = sum(item["bytes"] for item in entries)
    print(f"Verified open CC BY 4.0 record {RECORD_ID}; files={len(entries)}, bytes={total_bytes}", flush=True)
    results: list[dict[str, Any]] = []
    errors: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(download_one, item): item["key"] for item in entries}
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                result = future.result()
                results.append(result)
                print(f"{result['status']}: {key} ({result['bytes']} bytes)", flush=True)
            except Exception as error:  # surfaced after all independent transfers finish
                errors.append(f"{key}: {error}")
                print(f"FAILED: {key}: {error}", file=sys.stderr, flush=True)
    if errors:
        print("No complete manifest written; failures:\n" + "\n".join(errors), file=sys.stderr)
        return 1
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    metadata_bytes = json.dumps(record, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    metadata_sha256 = hashlib.sha256(metadata_bytes).hexdigest()
    METADATA_PATH.write_bytes(metadata_bytes)
    retrieved_on = datetime.now(timezone.utc).date().isoformat()
    manifest = create_manifest(record, results, metadata_sha256, retrieved_on)
    PROCESSING_REPORT_PATH.write_text(json.dumps({
        "sourceDoi": record["metadata"]["doi"],
        "status": "raw_download_verified_processing_pending",
        "totalRows": None,
        "downloadedFiles": len(results),
        "downloadedBytes": sum(item["bytes"] for item in results),
        "rowLevelMissingnessAndDuplicates": "Not yet assessed; no modeled or processed output is claimed.",
        "limitations": manifest["use"]["limitations"],
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "manifest": str(MANIFEST_PATH.relative_to(ROOT)),
        "files": len(results),
        "bytes": manifest["source"]["totalArchiveSizeBytes"],
        "wallSeconds": time.perf_counter() - started,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
