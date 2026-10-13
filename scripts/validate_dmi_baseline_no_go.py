#!/usr/bin/env python3
"""Validate the evidence-based no-go for the gated adult-cow DMI baseline."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from validate_dmi_supervised_readiness import validate as validate_readiness


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "docs/evidence/dmi-baseline-no-go-2026-10.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def repo_file(relative_path: Any, message: str) -> Path:
    require(isinstance(relative_path, str) and relative_path.strip(), message)
    candidate = (ROOT / relative_path).resolve()
    try:
        candidate.relative_to(ROOT.resolve())
    except ValueError as error:
        raise ValueError(message) from error
    require(candidate.is_file(), message)
    return candidate


def validate(report: dict[str, Any], readiness_report: dict[str, Any] | None = None) -> None:
    require(report.get("schemaVersion") == "riose.dmi-baseline-evaluation/v1", "unsupported schemaVersion")
    require(report.get("decision") == "no_go", "current evidence requires no_go")
    require(report.get("decisionStatus") == "evidence_based_no_go", "do not imply a scientific endorsement")
    estimand = report.get("estimand", {})
    require(estimand.get("unitOfAnalysis") == "animal-period", "unexpected analysis unit")
    require(estimand.get("targetPopulationAvailable") is False, "target population cannot be marked available")

    readiness = report.get("sourceReadiness", {})
    readiness_path = readiness.get("path")
    resolved_readiness_path = repo_file(readiness_path, "missing or unsafe source-readiness report")
    if readiness_report is None:
        with resolved_readiness_path.open(encoding="utf-8") as stream:
            gate = json.load(stream)
    else:
        gate = readiness_report
    # The linked gate is authoritative. Checking only its duplicated headline
    # fields would let an internally inconsistent or malformed readiness report
    # authorize this no-go artifact.
    validate_readiness(gate)
    require(gate.get("schemaVersion") == readiness.get("schemaVersion"), "readiness schema mismatch")
    require(gate.get("decision") == "no_go", "linked readiness gate is no longer no_go")
    require(
        gate.get("signoff", {}).get("status") == readiness.get("signoffStatus") == "evidence_based_no_go",
        "readiness status mismatch",
    )
    require(gate.get("reviewedMatrix", {}).get("eligibleSourcesForTarget") == readiness.get("eligibleSourcesForTarget") == 0,
            "eligible-source count mismatch")
    require(gate.get("reviewedMatrix", {}).get("conditionalSourcesForTarget") == readiness.get("conditionalSourcesForTarget") == 0,
            "conditional-source count mismatch")

    audit = report.get("leakageAudit", {})
    require(audit.get("status") == "not_run_no_eligible_cohort", "leakage audit must remain not-run without eligible data")
    require(audit.get("eligibleRows") == 0, "no eligible rows are available")
    require(isinstance(audit.get("requiredSplitUnit"), str) and audit["requiredSplitUnit"].strip(), "missing grouped split rule")
    split_rule = audit["requiredSplitUnit"].lower()
    require("study" in split_rule or "trial" in split_rule, "split rule must group whole studies or trials")
    require("animal" in split_rule, "split rule must keep repeated animal records together")
    controls = audit.get("requiredControls", [])
    require(isinstance(controls, list) and len(controls) >= 4, "missing leakage controls")
    controls_text = " ".join(item for item in controls if isinstance(item, str)).lower()
    for concept in ("preprocessing", "train", "feature", "outcome"):
        require(concept in controls_text, f"leakage controls must cover {concept}")

    evaluation = report.get("heldOutEvaluation", {})
    require(evaluation.get("status") == "not_measured", "held-out metrics must remain not measured")
    metrics = evaluation.get("metrics", {})
    required_metrics = {
        "maeKgDMPerAnimalDay",
        "rmseKgDMPerAnimalDay",
        "biasKgDMPerAnimalDay",
        "subgroups",
    }
    require(required_metrics.issubset(metrics), "held-out evaluation must declare every required metric")
    require(all(value is None for value in metrics.values()), "unmeasured metrics must be null")
    require("not zero error" in evaluation.get("reason", ""), "null metric meaning must be explicit")

    performance = report.get("performance", {})
    require(performance.get("modelTrainingPerformed") is False, "no training should be claimed")
    require(all(performance.get(field) is None for field in ("trainingRuntimeMs", "cpuInferenceMsPerAnimalPeriod", "memoryBytes")),
            "unmeasured performance values must be null")
    models = report.get("candidateModels", [])
    require(any(model.get("id") == "simple-supervised-baseline" and model.get("status") == "not_fit"
                and model.get("artifact") is None for model in models), "predictive baseline must remain unfit")
    require(any(model.get("id") == "mechanistic-reference" and model.get("status") == "not_evaluated"
                for model in models), "mechanistic reference must not be presented as evaluated")
    require(report.get("limitations"), "no-go requires limitations")
    require(report.get("nextEvidenceRequired"), "no-go must state reopening evidence")


def main() -> None:
    with REPORT.open(encoding="utf-8") as stream:
        validate(json.load(stream))
    print(f"Validated evidence-based baseline no-go report: {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
