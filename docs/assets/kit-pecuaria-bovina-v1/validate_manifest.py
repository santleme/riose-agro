#!/usr/bin/env python3
"""Validate the cattle library's planning manifest and scenario references.

Planned assets intentionally have no exported PNG yet. Pass --check-files only
after assets move to the export stage, when every manifest file must exist.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
EXPORT_ROOT = ROOT / "public/assets/cattle-v1"
KIT = Path(__file__).resolve().parent
MANIFEST_PATH = KIT / "manifest-candidate-v1.json"
SCENARIOS_PATH = KIT / "scenario-recipes-candidate-v1.json"
REUSE_PATH = KIT / "asset-reuse-inventory-v1.json"
REQUIRED = {
    "id", "category", "family", "file", "variants", "state",
    "dimensionsPx", "targetDimensionsPx", "logicalModulePx", "footprint",
    "anchor", "tags", "scenarioCompatibility", "styleVersion", "status",
    "atlas", "connectors", "notes",
}
STATUSES = {"planned", "experimental", "review", "approved", "rejected"}


def positive_pair(value: object) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(n, int) and n > 0 for n in value)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-files", action="store_true", help="require exported PNG files to exist")
    args = parser.parse_args()

    errors: list[str] = []
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    scenarios = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    reuse = json.loads(REUSE_PATH.read_text(encoding="utf-8"))
    assets = manifest.get("assets", [])
    ids = [asset.get("id") for asset in assets]
    if len(ids) != len(set(ids)):
        errors.append("asset IDs must be unique")
    by_id = {asset.get("id"): asset for asset in assets}
    scenario_ids = {scenario.get("id") for scenario in scenarios.get("scenarios", [])}

    for index, asset in enumerate(assets):
        label = asset.get("id") or f"assets[{index}]"
        missing = REQUIRED - asset.keys()
        if missing:
            errors.append(f"{label}: missing fields {sorted(missing)}")
        if asset.get("status") not in STATUSES:
            errors.append(f"{label}: unknown curation status {asset.get('status')!r}")
        if not positive_pair(asset.get("targetDimensionsPx")):
            errors.append(f"{label}: targetDimensionsPx must be two positive integers")
        if not positive_pair(asset.get("logicalModulePx")):
            errors.append(f"{label}: logicalModulePx must be two positive integers")
        footprint = asset.get("footprint")
        if not isinstance(footprint, list) or len(footprint) != 2 or any(not isinstance(n, int) or n < 0 for n in footprint):
            errors.append(f"{label}: footprint must be two nonnegative integers")
        elif asset.get("placement") == "world-sprite" and not all(footprint):
            errors.append(f"{label}: world sprite footprint must be nonzero")
        anchor = asset.get("anchor", {})
        if any(not isinstance(anchor.get(axis), (int, float)) or not 0 <= anchor[axis] <= 1 for axis in ("x", "y")):
            errors.append(f"{label}: anchor x/y must be normalized to [0,1]")
        pack = asset.get("atlas", {}).get("pack")
        if pack not in manifest.get("atlasPacks", []):
            errors.append(f"{label}: atlas pack {pack!r} is not declared")
        connectors = asset.get("connectors")
        if isinstance(connectors, dict):
            if connectors.get("coordinateSystem") != "isometric-grid-2to1":
                errors.append(f"{label}: connector coordinateSystem must be isometric-grid-2to1")
            for port in connectors.get("ports", []):
                position = port.get("position", [])
                if (
                    len(position) != 2
                    or not all(isinstance(value, (int, float)) for value in position)
                    or not 0 <= position[0] <= asset["footprint"][0]
                    or not 0 <= position[1] <= asset["footprint"][1]
                ):
                    errors.append(f"{label}: connector port {port.get('name')} is outside logical footprint")
        unknown_scenarios = set(asset.get("scenarioCompatibility", [])) - scenario_ids
        if unknown_scenarios:
            errors.append(f"{label}: unknown scenario IDs {sorted(unknown_scenarios)}")
        if args.check_files:
            file_path = EXPORT_ROOT / asset.get("file", "")
            if not file_path.is_file():
                errors.append(f"{label}: missing exported file {file_path.relative_to(ROOT)}")

    for scenario in scenarios.get("scenarios", []):
        for zone in scenario.get("zones", []):
            for asset_id, count in zone.get("assets", []):
                if asset_id not in by_id:
                    errors.append(f"{scenario.get('id')}/{zone.get('id')}: unknown asset ID {asset_id}")
                if isinstance(count, list) and (len(count) != 2 or count[0] < 0 or count[1] < count[0]):
                    errors.append(f"{scenario.get('id')}/{zone.get('id')}: invalid count range for {asset_id}")

    source_ids = [entry.get("sourceId") for entry in reuse.get("entries", [])]
    if len(source_ids) != len(set(source_ids)):
        errors.append("reuse inventory source IDs must be unique")
    for entry in reuse.get("entries", []):
        source_id = entry.get("sourceId", "<missing-source-id>")
        source_file = ROOT / entry.get("sourceFile", "")
        if not source_file.is_file():
            errors.append(f"reuse inventory {source_id}: source file not found")
        disposition = entry.get("disposition")
        if disposition == "reuse-candidate" and entry.get("targetId") not in by_id:
            errors.append(f"reuse inventory {source_id}: target ID is not in the v1 manifest")
        if disposition in {"support-only", "future-extension"} and entry.get("targetId") is not None:
            errors.append(f"reuse inventory {source_id}: optional/future asset must not map into cattle v1")

    if errors:
        print("Manifest validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Valid planning set: {len(assets)} unique asset IDs; {len(scenario_ids)} scenario recipes; {len(source_ids)} reuse decisions; all references resolve.")
    if args.check_files:
        print("All exported asset files exist.")
    else:
        print("PNG export existence is intentionally not required while assets are planned.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
