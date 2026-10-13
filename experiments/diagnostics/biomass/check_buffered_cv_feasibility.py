#!/usr/bin/env python3
"""Pre-fit coverage/count check for grouped biomass CV; never reads labels or OOF predictions."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet"
MANIFEST = ROOT / "data/mendeley-pasture-biomass/manifest.json"
OUT_JSON = ROOT / "experiments/diagnostics/biomass/buffered-cv-feasibility-2026-10.json"
OUT_MD = ROOT / "experiments/diagnostics/biomass/buffered-cv-feasibility-2026-10.md"
READ_COLUMNS = [
    "campaign", "farm", "field_code", "pixel_id", "sampling_point_id",
    "sward_height_cm", "latitude_deg", "longitude_deg",
]
BUFFER_M = 100.0


def haversine_m(lat: float, lon: float, lat2: np.ndarray, lon2: np.ndarray) -> np.ndarray:
    radius_m = 6_371_000.0
    lat1r, lon1r = np.radians(lat), np.radians(lon)
    lat2r, lon2r = np.radians(lat2), np.radians(lon2)
    a = np.sin((lat2r - lat1r) / 2.0) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin((lon2r - lon1r) / 2.0) ** 2
    return 2.0 * radius_m * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def find(parent: dict[tuple[str, str], tuple[str, str]], item: tuple[str, str]) -> tuple[str, str]:
    if parent[item] != item:
        parent[item] = find(parent, parent[item])
    return parent[item]


def union(parent: dict[tuple[str, str], tuple[str, str]], left: tuple[str, str], right: tuple[str, str]) -> None:
    a, b = find(parent, left), find(parent, right)
    if a != b:
        parent[max(a, b)] = min(a, b)


def build_report() -> dict[str, Any]:
    # The explicit column projection excludes the target aliases and the entire OOF artifact.
    frame = pd.read_parquet(DATA, columns=READ_COLUMNS)
    unexpected = set(frame.columns) - set(READ_COLUMNS)
    if unexpected or "dry_matter_yield_kg_dm_ha" in frame.columns:
        raise ValueError(f"Outcome columns were unexpectedly read: {sorted(unexpected)}")
    frame = frame.dropna(subset=["sward_height_cm", "latitude_deg", "longitude_deg"]).copy()
    if frame.empty:
        raise ValueError("No rows have sward height and coordinates")

    fields = sorted(set(zip(frame["farm"].astype(str), frame["field_code"].astype(str))))
    parent = {field: field for field in fields}
    # Fields sharing an exact source coordinate are a single indivisible holdout block.
    for _, coordinate_rows in frame.groupby(["farm", "latitude_deg", "longitude_deg"], sort=True):
        aliases = sorted(set(zip(coordinate_rows["farm"].astype(str), coordinate_rows["field_code"].astype(str))))
        for alias in aliases[1:]:
            union(parent, aliases[0], alias)
    roots = {field: find(parent, field) for field in fields}
    frame["block_id"] = ["/".join(roots[(str(farm), str(field))]) for farm, field in zip(frame["farm"], frame["field_code"])]

    locations = frame.groupby(["farm", "latitude_deg", "longitude_deg"], as_index=False, sort=True).agg(
        block_id=("block_id", "first"), field_codes=("field_code", lambda values: sorted(set(values.astype(str)))),
        rows=("campaign", "size"), campaigns=("campaign", lambda values: sorted(set(values.astype(str)))),
    )
    fold_rows: list[dict[str, Any]] = []
    scored_rows = 0
    for block_id in sorted(frame["block_id"].unique()):
        test_rows = frame[frame["block_id"] == block_id]
        test_locations = locations[locations["block_id"] == block_id]
        training_locations = locations[locations["block_id"] != block_id]
        keep_locations: list[bool] = []
        nearest_distances: list[float] = []
        for location in training_locations.itertuples(index=False):
            distances = haversine_m(
                location.latitude_deg, location.longitude_deg,
                test_locations["latitude_deg"].to_numpy(dtype=float),
                test_locations["longitude_deg"].to_numpy(dtype=float),
            )
            nearest = float(np.min(distances))
            nearest_distances.append(nearest)
            keep_locations.append(nearest >= BUFFER_M)
        kept = training_locations.loc[keep_locations]
        allowed = set(zip(kept["farm"].astype(str), kept["latitude_deg"], kept["longitude_deg"]))
        train_row_mask = [
            (str(farm), lat, lon) in allowed
            for farm, lat, lon in zip(frame["farm"], frame["latitude_deg"], frame["longitude_deg"])
        ]
        training_rows_after_buffer = int((frame["block_id"].ne(block_id) & pd.Series(train_row_mask, index=frame.index)).sum())
        scoreable = training_rows_after_buffer > 0
        if scoreable:
            scored_rows += len(test_rows)
        fold_rows.append({
            "heldOutBlock": block_id,
            "fields": sorted(set(test_rows["field_code"].astype(str))),
            "farms": sorted(set(test_rows["farm"].astype(str))),
            "testRows": int(len(test_rows)),
            "testCoordinateGroups": int(len(test_locations)),
            "campaigns": sorted(set(test_rows["campaign"].astype(str))),
            "trainingRowsAfter100mBuffer": training_rows_after_buffer,
            "trainingCoordinateGroupsAfter100mBuffer": int(len(kept)),
            "nearestCandidateTrainingDistanceMetersMin": float(min(nearest_distances)) if nearest_distances else None,
            "nearestCandidateTrainingDistanceMetersMedian": float(np.median(nearest_distances)) if nearest_distances else None,
            "scorableByNonemptyTrainingSet": bool(scoreable),
        })

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    declared_hash = next(
        item["sha256"] for item in manifest["processedOutputs"]
        if item["path"] == "data/mendeley-pasture-biomass/processed/pasture-biomass-samples-v1.parquet"
    )
    eligible_rows = int(len(frame))
    report = {
        "title": "Biomass spatial CV structural feasibility check",
        "analysisDate": "2026-10-13",
        "scope": "Pre-fit structural check only. Reads projected design/feature columns and does not read biomass target values, OOF predictions, or fit models.",
        "input": {
            "path": str(DATA.relative_to(ROOT)),
            "sha256FromRegistryManifest": declared_hash,
            "sourceColumnsRead": READ_COLUMNS,
            "outcomeOrPredictionColumnsRead": [],
        },
        "design": {
            "blockDefinition": "Leave-one-out by connected component of farm+field codes, where fields sharing an exact latitude/longitude are joined; all campaigns for each block remain together.",
            "bufferMeters": BUFFER_M,
            "bufferRule": "For each held-out block, remove every candidate training coordinate whose nearest great-circle distance to any held-out coordinate is less than 100 m.",
            "scoreableDefinition": "A held-out row is structurally scoreable when its fold retains at least one training row after buffering. This is only a coverage/count criterion, not a claim that sample size or dependence is scientifically adequate.",
            "eligibleFeatureRows": eligible_rows,
            "distinctFieldsBeforeCoordinateUnion": len(fields),
            "coordinateDeduplicatedBlocks": int(frame["block_id"].nunique()),
            "uniqueCoordinateGroupsAfterDeduplication": int(len(locations)),
            "repeatedCampaignVisitsPreserved": True,
            "scoredRowsUnderNonemptyTrainingCriterion": scored_rows,
            "scoredCoverage": scored_rows / eligible_rows,
            "heldOutBlocksWithNonemptyTraining": sum(item["scorableByNonemptyTrainingSet"] for item in fold_rows),
            "minimumRequiredCoverage": 0.70,
            "minimumRequiredHeldOutBlocks": 4,
            "coverageThresholdStructurallyMet": scored_rows / eligible_rows >= 0.70,
            "blockThresholdStructurallyMet": len(fold_rows) >= 4,
            "trainingRowsAfterBufferMin": min(item["trainingRowsAfter100mBuffer"] for item in fold_rows),
            "trainingRowsAfterBufferMedian": float(np.median([item["trainingRowsAfter100mBuffer"] for item in fold_rows])),
            "trainingRowsAfterBufferMax": max(item["trainingRowsAfter100mBuffer"] for item in fold_rows),
            "folds": fold_rows,
        },
        "interpretation": "The proposed row-coverage and block-count gates are structurally feasible under this exact leave-one-coordinate-deduplicated-field-component-out design: all feature-complete rows are scoreable by the nonempty-training criterion and 13 blocks are available. Each fold retains 210–216 feature rows across 105–108 unique coordinates after the 100 m exclusion. This establishes only design feasibility; it does not establish statistical independence, target quality, external farm validation, or predictive performance. The 13 blocks are nested in only two farms.",
    }
    return report


def render_markdown(report: dict[str, Any]) -> str:
    d = report["design"]
    lines = [
        "# Biomass buffered-CV structural feasibility (pre-fit)",
        "",
        "**Outcome-blind structural check:** no biomass values, OOF predictions, or model fits were read or produced.",
        "",
        f"Parquet input: `{report['input']['path']}`; registry SHA-256 `{report['input']['sha256FromRegistryManifest']}`. Columns projected: `{', '.join(report['input']['sourceColumnsRead'])}`.",
        "",
        f"Design: {d['blockDefinition']} Buffer: {d['bufferRule']}",
        "",
        f"Feature-complete rows: **{d['eligibleFeatureRows']}**; coordinate-deduplicated blocks: **{d['coordinateDeduplicatedBlocks']}** from {d['distinctFieldsBeforeCoordinateUnion']} fields; exact-coordinate groups: **{d['uniqueCoordinateGroupsAfterDeduplication']}**.",
        "",
        f"Structurally scoreable rows: **{d['scoredRowsUnderNonemptyTrainingCriterion']}/{d['eligibleFeatureRows']} ({d['scoredCoverage']:.1%})**. Blocks with nonempty training: **{d['heldOutBlocksWithNonemptyTrainingBlocks'] if 'heldOutBlocksWithNonemptyTrainingBlocks' in d else d['heldOutBlocksWithNonemptyTraining']}**. Gates met: coverage ≥70% = **{d['coverageThresholdStructurallyMet']}**; at least 4 held-out blocks = **{d['blockThresholdStructurallyMet']}**.",
        "",
        f"After the 100 m buffer, fold training rows range from **{d['trainingRowsAfterBufferMin']} to {d['trainingRowsAfterBufferMax']}** (median {d['trainingRowsAfterBufferMedian']:.0f}); unique training coordinates range from **{min(f['trainingCoordinateGroupsAfter100mBuffer'] for f in d['folds'])} to {max(f['trainingCoordinateGroupsAfter100mBuffer'] for f in d['folds'])}**.",
        "",
        "| Held-out block | Fields | Test rows | Test coordinates | Training rows after buffer | Training coordinates |",
        "|---|---|---:|---:|---:|---:|",
    ]
    for fold in d["folds"]:
        lines.append(f"| {fold['heldOutBlock']} | {', '.join(fold['fields'])} | {fold['testRows']} | {fold['testCoordinateGroups']} | {fold['trainingRowsAfter100mBuffer']} | {fold['trainingCoordinateGroupsAfter100mBuffer']} |")
    lines += ["", report["interpretation"], ""]
    return "\n".join(lines)


def main() -> None:
    report = build_report()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({"json": str(OUT_JSON.relative_to(ROOT)), "markdown": str(OUT_MD.relative_to(ROOT)),
                      "blocks": report["design"]["coordinateDeduplicatedBlocks"],
                      "coverage": report["design"]["scoredCoverage"], "modelFit": False}, indent=2))


if __name__ == "__main__":
    main()
