#!/usr/bin/env python3
"""Validate semantic asset records and source-file integrity; art remains a human gate."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError
from PIL import ImageCms
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "assets/manifests/manifest.json"
SCHEMA = ROOT / "assets/schemas/asset.schema.json"
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_DIMENSION = 4096


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_image(path: Path, asset: dict[str, Any]) -> tuple[list[str], list[str], str | None]:
    errors: list[str] = []
    warnings: list[str] = []
    aid = asset.get("id", "<missing-id>")
    review = asset.get("review") if isinstance(asset.get("review"), dict) else {}
    technical_pass = review.get("technical") == "pass"
    policy = asset.get("technicalPolicy") if isinstance(asset.get("technicalPolicy"), dict) else {}
    alpha_mode_value = policy.get("alphaMode", "unknown")
    alpha_mode = alpha_mode_value if isinstance(alpha_mode_value, str) else "unknown"

    try:
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            errors.append(f"FILE SIZE [{aid}]: {size} bytes exceeds {MAX_FILE_BYTES}")
            return errors, warnings, sha256_file(path)
        with Image.open(path) as im:
            if im.width > MAX_DIMENSION or im.height > MAX_DIMENSION:
                errors.append(f"RESOLUTION [{aid}]: {im.width}x{im.height} exceeds {MAX_DIMENSION}px limit")
                return errors, warnings, sha256_file(path)
            im.verify()
        with Image.open(path) as im:
            if im.format != "PNG":
                errors.append(f"NOT PNG [{aid}]: {im.format}")
            dimensions = asset.get("dimensions") if isinstance(asset.get("dimensions"), dict) else {}
            if [im.width, im.height] != [dimensions.get("width"), dimensions.get("height")]:
                errors.append(f"DIMENSION MISMATCH [{aid}]: actual {im.width}x{im.height}")
            if dimensions.get("format") != im.format:
                errors.append(f"FORMAT MISMATCH [{aid}]: manifest={dimensions.get('format')}, actual={im.format}")
            has_alpha = "A" in im.getbands()
            if dimensions.get("alpha") is True and not has_alpha:
                errors.append(f"ALPHA CHANNEL MISSING [{aid}]")
            elif dimensions.get("alpha") is False and has_alpha:
                warnings.append(f"ALPHA CHANNEL [{aid}]: file has alpha although manifest declares no alpha")

            embedded_profile = bool(im.info.get("icc_profile"))
            profile_state = asset.get("colorProfile", "unverified")
            if not embedded_profile:
                message = f"COLOR PROFILE [{aid}]: no embedded ICC profile; metadata says {profile_state}"
                (errors if technical_pass or profile_state == "embedded-srgb" else warnings).append(message)
            else:
                try:
                    icc = ImageCms.getOpenProfile(io.BytesIO(im.info["icc_profile"]))
                    icc_name = ImageCms.getProfileName(icc).lower()
                    if profile_state == "embedded-srgb" and "srgb" not in icc_name:
                        errors.append(f"COLOR PROFILE [{aid}]: manifest says embedded-srgb but ICC profile is {icc_name!r}")
                    elif profile_state == "unverified":
                        message = f"COLOR PROFILE [{aid}]: embedded ICC exists but profile is unclassified ({icc_name})"
                        (errors if technical_pass else warnings).append(message)
                except (OSError, ValueError) as exc:
                    errors.append(f"COLOR PROFILE [{aid}]: invalid embedded ICC profile: {exc}")

            if not has_alpha:
                if alpha_mode in {"hard-edge-sprite", "binary-alpha-tile"}:
                    message = f"ALPHA POLICY [{aid}]: {alpha_mode} requires an alpha channel for validation"
                    (errors if technical_pass else warnings).append(message)
                return errors, warnings, sha256_file(path)

            alpha = im.getchannel("A")
            bbox = alpha.getbbox()
            if bbox is None:
                errors.append(f"EMPTY ALPHA [{aid}]")
                return errors, warnings, None
            pixel_count = im.width * im.height
            histogram = alpha.histogram()
            transparent = histogram[0]
            opaque = histogram[255]
            partial = sum(histogram[1:255])

            alpha_problem: str | None = None
            if alpha_mode == "hard-edge-sprite" and partial:
                alpha_problem = f"{partial} partial-alpha pixels ({partial / pixel_count:.1%}); hard-edge sprites require alpha 0 or 255"
            elif alpha_mode == "binary-alpha-tile" and partial:
                alpha_problem = f"{partial} partial-alpha pixels; tile alpha must be binary (0 or 255)"
            elif alpha_mode not in {"hard-edge-sprite", "binary-alpha-tile", "soft-alpha-sprite"}:
                warnings.append(f"ALPHA POLICY [{aid}]: unsupported or missing alphaMode {alpha_mode!r}")
            if alpha_problem:
                message = f"ALPHA POLICY [{aid}]: {alpha_problem}"
                (errors if technical_pass else warnings).append(message)

            # Transparent RGB can bleed under filtered scaling; this is only a heuristic, not halo detection.
            if transparent:
                colors: set[tuple[int, int, int]] = set()
                for r, g, b, a in im.convert("RGBA").getdata():
                    if a == 0:
                        colors.add((r, g, b))
                        if len(colors) > 16:
                            break
                if len(colors) > 16:
                    warnings.append(f"EDGE RGB HEURISTIC [{aid}]: many hidden RGB values under alpha 0; inspect scaled previews for possible resampling bleed (not proof of a halo)")

            if alpha_mode in {"hard-edge-sprite", "soft-alpha-sprite"}:
                x0, y0, x1, y1 = bbox
                padding = min(x0, y0, im.width - x1, im.height - y1)
                required = policy.get("paddingMinPx", 2)
                if not isinstance(required, int) or required < 0:
                    errors.append(f"POLICY ERROR [{aid}]: paddingMinPx must be a nonnegative integer")
                elif padding < required:
                    message = f"PADDING [{aid}]: {padding}px clear space; policy requires {required}px"
                    (errors if technical_pass else warnings).append(message)

            return errors, warnings, sha256_file(path)
    except (OSError, UnidentifiedImageError, ValueError, KeyError, Image.DecompressionBombError) as exc:
        errors.append(f"IMAGE ERROR [{aid}]: {exc}")
        return errors, warnings, None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--promotion-gate", action="store_true",
                        help="require every manifest item to pass review and have documented rights")
    args = parser.parse_args(argv)

    try:
        manifest = json.loads(MANIFEST.read_text())
        schema = json.loads(SCHEMA.read_text())
        Draft202012Validator.check_schema(schema)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INPUT ERROR: {exc}")
        return 1

    if not isinstance(manifest, dict):
        print("MANIFEST ERROR: root must be an object")
        return 1
    assets = manifest.get("assets")
    refs = manifest.get("referenceAuthority")
    if (manifest.get("schemaVersion") != 1 or manifest.get("semanticManifest") is not True
            or not isinstance(assets, list) or not isinstance(manifest.get("library"), str)
            or not isinstance(manifest.get("styleVersion"), str) or not isinstance(manifest.get("status"), str)
            or not isinstance(refs, dict)):
        print("MANIFEST ERROR: invalid semantic manifest envelope")
        return 1

    errors = warning_count = gate_failures = 0
    for kind, ref in refs.items():
        ref_path = (ROOT / ref).resolve() if isinstance(ref, str) else ROOT
        if not isinstance(ref, str) or ROOT.resolve() not in ref_path.parents or not ref_path.is_file():
            print(f"REFERENCE ERROR [{kind}]: missing, invalid, or out-of-root path {ref!r}")
            errors += 1

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    ids: set[str] = set()
    hashes: dict[str, str] = {}
    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            print(f"SCHEMA assets[{index}]: record must be an object")
            errors += 1
            continue
        for error in validator.iter_errors(asset):
            print(f"SCHEMA assets[{index}] {list(error.path)}: {error.message}")
            errors += 1
        aid = asset.get("id", f"<assets[{index}]>")
        if isinstance(aid, str) and aid in ids:
            print(f"DUPLICATE ID: {aid}")
            errors += 1
        if isinstance(aid, str):
            ids.add(aid)

        file_value = asset.get("file")
        if not isinstance(file_value, str) or not file_value:
            continue
        relative = Path(file_value)
        path = (ROOT / relative).resolve()
        if ROOT.resolve() not in path.parents:
            print(f"PATH ERROR [{aid}]: asset path escapes repository root")
            errors += 1
            continue
        if not path.is_file():
            print(f"MISSING FILE [{aid}]: {file_value}")
            errors += 1
            continue

        file_errors, file_warnings, digest = inspect_image(path, asset)
        for message in file_errors:
            print(message)
        errors += len(file_errors)
        for message in file_warnings:
            print(message)
        warning_count += len(file_warnings)
        if digest:
            previous = hashes.get(digest)
            if previous:
                print(f"DUPLICATE FILE: {aid} == {previous}")
                warning_count += 1
            hashes[digest] = aid
            source = asset.get("source") if isinstance(asset.get("source"), dict) else {}
            if asset.get("fileSha256") != digest:
                print(f"FILE HASH MISMATCH [{aid}]")
                errors += 1
            source_file = source.get("sourceFile")
            source_hash = source.get("sha256")
            if isinstance(source_file, str) and source_file:
                source_path = (ROOT / source_file).resolve()
                if ROOT.resolve() not in source_path.parents or not source_path.is_file():
                    print(f"SOURCE PATH ERROR [{aid}]: missing or out-of-root source {source_file}")
                    errors += 1
                elif source_hash != sha256_file(source_path):
                    print(f"SOURCE HASH MISMATCH [{aid}]")
                    errors += 1
            prompt_file = source.get("promptFile")
            if isinstance(prompt_file, str) and prompt_file:
                prompt_path = (ROOT / prompt_file).resolve()
                if ROOT.resolve() not in prompt_path.parents or not prompt_path.is_file():
                    print(f"PROMPT PATH ERROR [{aid}]: missing or out-of-root prompt {prompt_file}")
                    errors += 1

        # Semantic records do not contain atlas geometry. Atlas bounds/bleed checks belong to a separate graphics manifest.
        if asset.get("atlas") is not None:
            print(f"ATLAS NOTE [{aid}]: semantic atlas data is not validated here; use the graphics-manifest validator")
            warning_count += 1

        review = asset.get("review") if isinstance(asset.get("review"), dict) else {}
        status = asset.get("status")
        if isinstance(status, str) and status in {"APPROVED", "RELEASED"} and (review.get("art") != "pass" or review.get("technical") != "pass"):
            print(f"PROMOTION BLOCKED [{aid}]: approval states do not both pass")
            errors += 1
        rights = asset.get("rights") if isinstance(asset.get("rights"), dict) else {}
        source = asset.get("source") if isinstance(asset.get("source"), dict) else {}
        source_kind = source.get("kind")
        notes = rights.get("notes")
        technology_class = asset.get("technologyClass")
        evidence = asset.get("evidence")
        tech_evidence_ok = not (isinstance(technology_class, str) and technology_class in {"A", "B"}) or (
            isinstance(evidence, list) and any(isinstance(item, dict) and item.get("reviewerRole") == "domain-expert" for item in evidence)
        )
        release_record = asset.get("releaseRecord")
        release_record_ok = status != "RELEASED"
        if status == "RELEASED" and isinstance(release_record, dict):
            graphics_manifest = release_record.get("graphicsManifest")
            graphics_path = (ROOT / graphics_manifest).resolve() if isinstance(graphics_manifest, str) else ROOT
            release_record_ok = ROOT.resolve() in graphics_path.parents and graphics_path.is_file()
        rights_ok = rights.get("licenseState") == "documented" and isinstance(notes, str) and bool(notes.strip())
        if args.promotion_gate and (status not in {"APPROVED", "RELEASED"} if isinstance(status, str) else True):
            print(f"PROMOTION GATE FAIL [{aid}]: status={status}, art={review.get('art')}, technical={review.get('technical')}, rights={rights.get('licenseState')}")
            gate_failures += 1
        elif args.promotion_gate and (review.get("art") != "pass" or review.get("technical") != "pass" or not rights_ok or (isinstance(source_kind, str) and source_kind in {"legacy-unknown", "unknown"}) or not tech_evidence_ok or not release_record_ok):
            reasons = []
            if review.get("art") != "pass": reasons.append("art review")
            if review.get("technical") != "pass": reasons.append("technical review")
            if not rights_ok: reasons.append("documented rights and nonempty basis")
            if isinstance(source_kind, str) and source_kind in {"legacy-unknown", "unknown"}: reasons.append("unknown source provenance")
            if not tech_evidence_ok: reasons.append("A/B technology evidence")
            if not release_record_ok: reasons.append("release package record")
            print(f"PROMOTION GATE FAIL [{aid}]: missing/failed {', '.join(reasons)}")
            gate_failures += 1

    print(f"Checked {len(ids)} assets; {errors} structural/integrity error(s), {warning_count} warning(s).")
    print("Visual style, halo judgment, connectors, and scene context remain human-review decisions.")
    if args.promotion_gate:
        print(f"Promotion gate: {'PASS' if gate_failures == 0 and errors == 0 else 'FAIL'} ({gate_failures} item(s) not promotable)")
        return 1 if errors or gate_failures else 0
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
