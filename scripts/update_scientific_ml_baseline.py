#!/usr/bin/env python3
"""Refresh only the pinned bytes and SHA-256 for the authorized ML report."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = "experiments/scientific-ml/baseline-v1.json"
ALLOWED_REPORT = "docs/evidence/engine-adg-usda-cgrec-transport-check.json"
SOURCE_AUDIT = "docs/evidence/usda-cgrec-longterm-audit.json"
SOURCE_DATA = "data/usda-cgrec-longterm/Streeter-ND_1989-2015_compiled.csv"
CPER_REPORT = "docs/evidence/engine-adg-usda-cper-ltgi-check.json"
ENGINE_SOURCE_FILES = (
    "engine.js",
    "animal-view-state.js",
    "feeding-model.js",
    "environment-model.js",
    "metabolism-wasm.js",
)
MUTABLE_PROVENANCE_PATHS = (
    ("source", "integrityAuditSha256"),
    ("transferFromCper", "cperEngineSha256"),
    ("transferFromCper", "engineSha256"),
    ("transferFromCper", "engineSourceFiles"),
)
REVIEW_REQUIRED = "SCIENTIFIC_BASELINE_CHANGE_REQUIRES_REVIEW"


class BaselineChangeRequiresReview(ValueError):
    """Raised when an update exceeds the authorized provenance-only scope."""


def fail(message: str) -> None:
    raise BaselineChangeRequiresReview(f"{REVIEW_REQUIRED}: {message}")


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def engine_source_sha256(root: Path) -> str:
    """Mirror the versioned engine-source bundle framing used by engine-provenance.js."""
    bundle = bytearray()
    for filename in ENGINE_SOURCE_FILES:
        source = (root / "src/client" / filename).read_bytes()
        normalized = source.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        bundle.extend(f"{filename}\0{len(normalized)}\0".encode("utf-8"))
        bundle.extend(normalized)
        bundle.append(0)
    return sha256(bytes(bundle))


def pinned_report_bytes(root: Path, expected_sha256: str, expected_bytes: int) -> bytes:
    """Find the exact report version pinned by the current baseline in Git history."""
    history = subprocess.run(
        ["git", "-c", f"safe.directory={root.resolve()}", "log", "--all", "--format=%H", "--", ALLOWED_REPORT],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    revisions = history.stdout.splitlines()
    if not revisions:
        fail("cannot find a Git history for the allowlisted report")

    for revision in revisions:
        result = subprocess.run(
            ["git", "-c", f"safe.directory={root.resolve()}", "show", f"{revision}:{ALLOWED_REPORT}"],
            cwd=root,
            check=True,
            capture_output=True,
        )
        content = result.stdout
        if len(content) == expected_bytes and sha256(content) == expected_sha256:
            return content
    fail("baseline-pinned report bytes are absent from Git history")


def remove_mutable_provenance(report: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with only named engine/audit digests excluded from comparison."""
    result = copy.deepcopy(report)
    for path in MUTABLE_PROVENANCE_PATHS:
        old: Any = result
        for key in path[:-1]:
            if not isinstance(old, dict) or key not in old:
                fail(f"expected provenance field is missing: {'.'.join(path)}")
            old = old[key]
        key = path[-1]
        expected_type = list if key == "engineSourceFiles" else str
        if not isinstance(old, dict) or key not in old or not isinstance(old[key], expected_type):
            fail(f"expected provenance field is missing or invalid: {'.'.join(path)}")
        if key == "engineSourceFiles" and any(not isinstance(filename, str) for filename in old[key]):
            fail(f"expected provenance field is invalid: {'.'.join(path)}")
        if key != "engineSourceFiles" and re.fullmatch(r"[0-9a-f]{64}", old[key]) is None:
            fail(f"expected provenance digest is invalid: {'.'.join(path)}")
        del old[key]
    return result


def verify_report_identity(root: Path, baseline: dict[str, Any], report: dict[str, Any]) -> None:
    """Bind mutable report metadata back to the persisted source and frozen cohort."""
    source = report.get("source")
    transfer = report.get("transferFromCper")
    try:
        source_metadata = baseline["files"][SOURCE_DATA]
        frozen_adg = baseline["adg"]
    except (KeyError, TypeError):
        fail("baseline is missing frozen CGREC source identity")
    if not isinstance(source, dict) or not isinstance(transfer, dict):
        fail("report is missing CGREC source or transfer identity")

    data_path = root / SOURCE_DATA
    audit_path = root / SOURCE_AUDIT
    if not data_path.is_file() or not audit_path.is_file():
        fail("CGREC source data or integrity audit is missing")
    data_bytes = data_path.read_bytes()
    if (
        len(data_bytes) != source_metadata.get("bytes")
        or sha256(data_bytes) != source_metadata.get("sha256")
        or source.get("sha256") != source_metadata.get("sha256")
    ):
        fail("CGREC dataset identity differs from the frozen baseline")
    audit_bytes = audit_path.read_bytes()
    lf_audit = audit_bytes.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    crlf_audit = lf_audit.replace(b"\n", b"\r\n")
    # Reports can be generated before Git converts a text audit file's line endings.
    audit_digests = {sha256(audit_bytes), sha256(lf_audit), sha256(crlf_audit)}
    if source.get("integrityAuditSha256") not in audit_digests:
        fail("CGREC integrity-audit digest does not match the persisted audit file")

    expected_source = {
        "doi": frozen_adg.get("sourceDoi"),
        "license": frozen_adg.get("license"),
        "eligibleSteerYearlings": frozen_adg.get("nExternalRows"),
        "years": frozen_adg.get("externalYears"),
    }
    expected_transfer = {
        "cperSourceDoi": frozen_adg.get("developmentSourceDoi"),
        "developmentN": frozen_adg.get("developmentN"),
        "developmentYears": frozen_adg.get("developmentYears"),
        "cgrecOutcomesUsedForFitting": frozen_adg.get("cgrecOutcomesUsedForFitting"),
    }
    if any(source.get(key) != value for key, value in expected_source.items()):
        fail("CGREC source identity differs from the frozen baseline")
    if any(transfer.get(key) != value for key, value in expected_transfer.items()):
        fail("CPER/CGREC cohort identity differs from the frozen baseline")

    engine_sha256 = engine_source_sha256(root)
    try:
        cper_report = json.loads((root / CPER_REPORT).read_bytes())
        cper_engine = cper_report["engine"]
    except (OSError, KeyError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        fail("CPER engine provenance is missing or invalid")
    if (
        transfer.get("engineSourceFiles") != list(ENGINE_SOURCE_FILES)
        or transfer.get("engineSha256") != engine_sha256
        or transfer.get("cperEngineSha256") != engine_sha256
        or cper_engine.get("sourceFiles") != list(ENGINE_SOURCE_FILES)
        or cper_engine.get("sha256") != engine_sha256
    ):
        fail("CGREC/CPER report does not identify the current engine source bundle")


def update_baseline(root: Path, report_argument: str) -> dict[str, Any]:
    """Validate and refresh the one explicitly authorized report record."""
    if report_argument != ALLOWED_REPORT:
        fail(f"report is not allowlisted: {report_argument}")

    baseline_file = root / BASELINE_PATH
    report_file = root / ALLOWED_REPORT
    resolved_root = root.resolve()
    if baseline_file.is_symlink() or report_file.is_symlink():
        fail("baseline and report must be regular repository files")
    if baseline_file.resolve(strict=True) != resolved_root / BASELINE_PATH:
        fail("baseline path resolves outside its allowlisted repository location")
    if report_file.resolve(strict=True) != resolved_root / ALLOWED_REPORT:
        fail("report path resolves outside its allowlisted repository location")
    baseline_bytes = baseline_file.read_bytes()
    report_bytes = report_file.read_bytes()
    try:
        baseline = json.loads(baseline_bytes)
        report = json.loads(report_bytes)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        fail(f"baseline or report is not valid UTF-8 JSON: {error}")
    if not isinstance(baseline, dict) or not isinstance(report, dict):
        fail("baseline and report must contain JSON objects")
    verify_report_identity(root, baseline, report)

    try:
        report_metadata = baseline["files"][ALLOWED_REPORT]
    except (KeyError, TypeError):
        fail("allowlisted report is not present in the frozen baseline")
    if not isinstance(report_metadata, dict) or set(report_metadata) != {"sha256", "bytes"}:
        fail("allowlisted baseline record has an unexpected shape")
    if (
        not isinstance(report_metadata["sha256"], str)
        or re.fullmatch(r"[0-9a-f]{64}", report_metadata["sha256"]) is None
        or not isinstance(report_metadata["bytes"], int)
        or isinstance(report_metadata["bytes"], bool)
        or report_metadata["bytes"] < 0
    ):
        fail("allowlisted baseline record has invalid byte/hash metadata")

    old_sha256 = report_metadata["sha256"]
    old_bytes = report_metadata["bytes"]
    if len(report_bytes) != old_bytes or sha256(report_bytes) != old_sha256:
        old_report_bytes = pinned_report_bytes(root, old_sha256, old_bytes)
        old_report = json.loads(old_report_bytes)
        if remove_mutable_provenance(old_report) != remove_mutable_provenance(report):
            fail("report scientific, identity, interpretation, or eligibility fields changed")

    updated = copy.deepcopy(baseline)
    updated["files"][ALLOWED_REPORT]["bytes"] = len(report_bytes)
    updated["files"][ALLOWED_REPORT]["sha256"] = sha256(report_bytes)
    serialized = (json.dumps(updated, indent=2) + "\n").encode("utf-8")
    if serialized != baseline_bytes:
        descriptor, temporary_name = tempfile.mkstemp(prefix=f"{baseline_file.name}.", dir=baseline_file.parent)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(serialized)
            os.chmod(temporary_name, baseline_file.stat().st_mode)
            os.replace(temporary_name, baseline_file)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)

    return {
        "report": ALLOWED_REPORT,
        "oldBytes": old_bytes,
        "newBytes": len(report_bytes),
        "oldSha256": old_sha256,
        "newSha256": sha256(report_bytes),
        "scientificDiff": "none",
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {Path(argv[0]).name} {ALLOWED_REPORT}", file=sys.stderr)
        return 2
    try:
        result = update_baseline(ROOT, argv[1])
    except BaselineChangeRequiresReview as error:
        print(error, file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
