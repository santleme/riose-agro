#!/usr/bin/env python3
"""Validate the evidence links and decision fields in the supervised DMI gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/dmi-supervised-readiness-2026-10.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate(report: dict[str, Any]) -> None:
    require(report.get("schemaVersion") == "riose.supervised-readiness/v1", "unsupported schemaVersion")
    require(report.get("decision") in {"go", "no_go", "conditional"}, "invalid decision")
    estimand = report.get("estimand", {})
    for field in ("population", "outcome", "unitOfAnalysis", "intendedUse"):
        require(isinstance(estimand.get(field), str) and estimand[field].strip(), f"missing estimand.{field}")
    require(estimand.get("unitOfAnalysis") == "animal-period", "unexpected analysis unit")
    require("kg" in estimand.get("outcome", "") and "DMI" in estimand.get("outcome", ""), "outcome must name DMI units")

    eligibility = report.get("eligibility", {})
    for field in ("inclusion", "exclusion", "groupIdentity"):
        require(isinstance(eligibility.get(field), list) and eligibility[field], f"missing eligibility.{field}")
    require(isinstance(eligibility.get("splitUnit"), str) and eligibility["splitUnit"].strip(), "missing splitUnit")
    require(eligibility.get("outcomeUnit") == "kg DM/animal/day", "unexpected outcome unit")

    matrix = report.get("reviewedMatrix", {})
    matrix_path = matrix.get("path")
    require(isinstance(matrix_path, str) and (ROOT / matrix_path).is_file(), "missing readiness matrix reference")
    with (ROOT / matrix_path).open(encoding="utf-8") as stream:
        matrix_doc = json.load(stream)
    require(matrix_doc.get("schemaVersion") == matrix.get("schemaVersion"), "matrix schema mismatch")
    require(matrix_doc.get("processing", {}).get("sourceCount") == matrix.get("reviewedSourceCount"), "matrix source count mismatch")
    require(len(matrix_doc.get("sources", [])) == matrix.get("reviewedSourceCount"), "matrix source array count mismatch")

    candidates = report.get("candidateEvidence", [])
    require(candidates, "candidateEvidence must be non-empty")
    for candidate in candidates:
        for field in ("id", "source", "decision", "access", "license", "populationFit", "outcomeFit", "missingnessAndIdentity"):
            require(isinstance(candidate.get(field), str) and candidate[field].strip(), f"{candidate.get('id', 'candidate')}: missing {field}")
        source_path = candidate["source"]
        require((ROOT / source_path).is_file(), f"missing source evidence: {source_path}")
        require(isinstance(candidate.get("references"), list) and candidate["references"], f"{candidate['id']}: references required")
        for reference in candidate["references"]:
            if reference.startswith("http://") or reference.startswith("https://"):
                continue
            require((ROOT / reference).is_file(), f"{candidate['id']}: missing reference {reference}")

    require(report.get("decision") == "no_go", "current evidence requires no_go")
    require(matrix.get("eligibleSourcesForTarget") == 0, "eligible source count must be zero for this gate")
    require(report.get("blockers"), "no_go requires blockers")
    require(report.get("nextEvidenceRequired"), "decision must state reopening evidence")
    signoff = report.get("signoff", {})
    require(signoff.get("status") == "pending", "this unsigned report must remain pending")
    require(signoff.get("domainExpertReview") == "pending_not_obtained", "do not imply expert signoff")
    require(report.get("performance", {}).get("modelTrainingPerformed") is False, "no training should be claimed")


def main() -> None:
    with REPORT.open(encoding="utf-8") as stream:
        validate(json.load(stream))
    print(f"Validated supervised readiness report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
