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
EXPECTED_FILES = {"Readme.md"} | {f"accel-{i:02d}.csv" for i in range(1, 19)} | {
    f"halter-{i:02d}.csv" for i in range(1, 19)
}
USER_AGENT = "Riose-open-scientific-data/1.0"
CHUNK_SIZE = 4 * 1024 * 1024


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


def create_manifest(record: dict[str, Any], verified_files: list[dict[str, Any]]) -> dict[str, Any]:
    metadata = record["metadata"]
    ordered = sorted(verified_files, key=lambda item: item["key"])
    if len(ordered) != len(EXPECTED_FILES) or any(
        item["status"] not in {"downloaded_and_verified", "verified_existing"} for item in ordered
    ):
        raise ValueError("Cannot register a partially downloaded or unchecked source")
    readme = next(item for item in ordered if item["key"] == "Readme.md")
    return {
        "schemaVersion": "riose.scientific-dataset-manifest/v1",
        "datasetId": "precision-beef-zenodo-4064802",
        "doi": metadata.get("doi"),
        "officialRecord": record.get("links", {}).get("html"),
        "officialApi": API_URL,
        "version": metadata.get("version"),
        "license": metadata["license"]["id"],
        "accessRight": metadata["access_right"],
        "downloadedAtUtc": datetime.now(timezone.utc).isoformat(),
        "population": {
            "species": "Bos taurus",
            "category": "Limousin-cross finishing steers",
            "count": 18,
            "trials": 3,
            "setting": "indoor straw housing, ad libitum total mixed ration, Easter Howgate Farm, UK",
            "trialByAnimal": {"01-06": 1, "07-10": 2, "11-18": 3},
            "officialTestAnimals": ["04", "10", "11"],
        },
        "measurement": {
            "input": "neck collar 3-axis MEMS acceleration at 10 Hz; acceleration in mg",
            "reference": "RumiWatch muzzle halter jaw-pressure classifier at 10 Hz, not independent human-video annotation",
            "labels": {"0": "other", "1": "rumination", "2": "eating_or_drinking"},
            "warning": "Drinking samples were merged into Eating in the published label set; target is agreement with the instrument-derived reference, not human-confirmed ethological ground truth.",
        },
        "readme": {"path": f"data/raw/zenodo-{RECORD_ID}/Readme.md", "bytes": readme["bytes"], "md5": readme["md5"], "sha256": readme["sha256"]},
        "files": [
            {key: value for key, value in item.items() if key != "url"}
            | {"path": f"data/raw/zenodo-{RECORD_ID}/{item['key']}", "downloadUrl": item["url"]}
            for item in ordered
        ],
        "totalBytes": sum(item["bytes"] for item in ordered),
        "limitations": [
            "Housed finishing steers are not grazing beef cows or pasture grazing sessions.",
            "Three animals form the source-defined test set (one per trial); inferential stability across animals is limited.",
            "Labels are RumiWatch-derived and drinking is merged into eating.",
            "This cohort cannot validate DMI, ADG, pasture behavior, or the Riose engine.",
        ],
        "eligibility": {
            "separate_housed_steer_sensor_agreement_task": "conditional_after_schema_audit",
            "pasture_behavior_validation": "ineligible",
            "mature_cow_pasture_dmi": "ineligible",
            "commercialReuse": "CC BY 4.0; retain attribution and source DOI",
        },
    }


def main() -> int:
    started = time.perf_counter()
    record = fetch_record()
    entries = [parse_file_entry(item) for item in record["files"]]
    total_bytes = sum(item["bytes"] for item in entries)
    print(f"Verified open CC BY 4.0 record {RECORD_ID}; files={len(entries)}, bytes={total_bytes}", flush=True)
    results: list[dict[str, Any]] = []
    errors: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
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
    manifest = create_manifest(record, results)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "manifest": str(MANIFEST_PATH.relative_to(ROOT)),
        "files": len(results),
        "bytes": manifest["totalBytes"],
        "wallSeconds": time.perf_counter() - started,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
