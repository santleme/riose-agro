#!/usr/bin/env python3
"""Validate the evidence links and decision fields in the supervised DMI gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/dmi-supervised-readiness-2026-10.json"
ROOT_REAL = ROOT.resolve()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def evidence_file(reference: str, label: str) -> Path:
    """Resolve a repository evidence path without following it outside ROOT."""
    require(isinstance(reference, str) and reference.strip(), f"missing {label}")
    candidate = (ROOT / reference).resolve()
    try:
        candidate.relative_to(ROOT_REAL)
    except ValueError as error:
        raise ValueError(f"{label} escapes repository root: {reference}") from error
    require(candidate.is_file(), f"missing {label}: {reference}")
    return candidate


def validate(report: dict[str, Any]) -> None:
    require(report.get("schemaVersion") == "riose.supervised-readiness/v1", "unsupported schemaVersion")
    require(report.get("decision") in {"go", "no_go", "conditional"}, "invalid decision")
    estimand = report.get("estimand", {})
    for field in ("population", "outcome", "unitOfAnalysis", "intendedUse"):
        require(isinstance(estimand.get(field), str) and estimand[field].strip(), f"missing estimand.{field}")
    require(estimand.get("unitOfAnalysis") == "animal-period", "unexpected analysis unit")
    outcome = estimand.get("outcome", "").lower()
    require(
        "total dmi" in outcome and "forage" in outcome and "supplement" in outcome
        and "kg dry matter" in outcome and "animal per day" in outcome,
        "outcome must define total DMI, its components, and animal-day units",
    )
    population = estimand.get("population", "").lower()
    require(
        "mature beef cows" in population and "pasture" in population,
        "population must define mature beef cows managed on pasture",
    )

    eligibility = report.get("eligibility", {})
    for field in ("inclusion", "exclusion", "groupIdentity"):
        require(isinstance(eligibility.get(field), list) and eligibility[field], f"missing eligibility.{field}")
    split_unit = eligibility.get("splitUnit", "").lower()
    require(
        "whole studies/trials" in split_unit and "for an animal in one partition" in split_unit
        and "do not randomly split" in split_unit,
        "splitUnit must preserve study and animal groups and prohibit row-random splits",
    )
    require(eligibility.get("outcomeUnit") == "kg DM/animal/day", "unexpected outcome unit")
    require(
        set(eligibility.get("groupIdentity", [])) == {"study_or_trial_id", "animal_id", "animal_period_id"},
        "groupIdentity must identify study/trial, animal, and animal-period",
    )

    matrix = report.get("reviewedMatrix", {})
    matrix_path = matrix.get("path")
    matrix_file = evidence_file(matrix_path, "readiness matrix reference")
    with matrix_file.open(encoding="utf-8") as stream:
        matrix_doc = json.load(stream)
    require(matrix_doc.get("schemaVersion") == matrix.get("schemaVersion"), "matrix schema mismatch")
    require(matrix_doc.get("processing", {}).get("sourceCount") == matrix.get("reviewedSourceCount"), "matrix source count mismatch")
    require(len(matrix_doc.get("sources", [])) == matrix.get("reviewedSourceCount"), "matrix source array count mismatch")
    target_counts = [
        matrix.get("eligibleSourcesForTarget"),
        matrix.get("conditionalSourcesForTarget"),
        matrix.get("ineligibleOrUnavailableSourcesForTarget"),
    ]
    require(all(isinstance(count, int) and count >= 0 for count in target_counts), "invalid target-readiness source counts")
    require(sum(target_counts) == matrix.get("reviewedSourceCount"), "target-readiness counts must classify every reviewed source exactly once")

    candidates = report.get("candidateEvidence", [])
    require(candidates, "candidateEvidence must be non-empty")
    for candidate in candidates:
        for field in ("id", "source", "decision", "access", "license", "populationFit", "outcomeFit", "missingnessAndIdentity"):
            require(isinstance(candidate.get(field), str) and candidate[field].strip(), f"{candidate.get('id', 'candidate')}: missing {field}")
        source_path = candidate["source"]
        evidence_file(source_path, f"source evidence for {candidate['id']}")
        require(isinstance(candidate.get("references"), list) and candidate["references"], f"{candidate['id']}: references required")
        for reference in candidate["references"]:
            require(isinstance(reference, str) and reference.strip(), f"{candidate['id']}: invalid reference")
            if reference.startswith("http://") or reference.startswith("https://"):
                continue
            evidence_file(reference, f"{candidate['id']}: reference {reference}")

    require(report.get("decision") == "no_go", "current evidence requires no_go")
    require(matrix.get("eligibleSourcesForTarget") == 0, "eligible source count must be zero for this gate")
    require(matrix.get("conditionalSourcesForTarget") == 0, "conditional source count must be zero for this target")
    require(matrix.get("ineligibleOrUnavailableSourcesForTarget") == matrix.get("reviewedSourceCount"), "every reviewed source must be excluded from this target")
    require(report.get("blockers"), "no_go requires blockers")
    require(report.get("nextEvidenceRequired"), "decision must state reopening evidence")
    require(
        any("No locally accessible" in item and "total-DMI outcome" in item for item in report["blockers"]),
        "no_go must state the missing target-matched source and outcome",
    )
    require(
        any("public or authorized individual-level dataset" in item.lower() for item in report["nextEvidenceRequired"]),
        "reopening criteria must require a target-matched reusable dataset",
    )
    signoff = report.get("signoff", {})
    require(signoff.get("domainExpertReview") == "not_performed", "do not imply expert signoff")
    require(report.get("performance", {}).get("modelTrainingPerformed") is False, "no training should be claimed")


def main() -> None:
    with REPORT.open(encoding="utf-8") as stream:
        validate(json.load(stream))
    print(f"Validated supervised readiness report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
