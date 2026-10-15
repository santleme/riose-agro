#!/usr/bin/env python3
"""Integrity and descriptive source audit for the CC0 Dryad finishing-steer data."""
import csv
import hashlib
import json
import statistics
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data/dryad-finishing-steers"
CSV_PATH = DATA / "Database_09-11-2025.csv"
MANIFEST_PATH = DATA / "manifest.json"
REPORT_PATH = ROOT / "docs/evidence/dryad-finishing-steers-audit.json"
manifest = json.loads(MANIFEST_PATH.read_text())
raw = CSV_PATH.read_bytes()
sha = hashlib.sha256(raw).hexdigest()
if sha != manifest["files"][CSV_PATH.name]["sha256"]:
    raise SystemExit("CSV SHA-256 does not match the archived manifest")
if sha != manifest["files"][CSV_PATH.name]["dryadSha256"]:
    raise SystemExit("CSV SHA-256 does not match Dryad's public API digest")
with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)
expected = ["Project", "Animal", "Breed", "ADG_Fin", "SMBW_Fin", "DMI_Fin", "CO2_Fin", "CH4_g_Fin", "CH4_MJ_Fin", "O2_Fin", "CP_%", "NDF_%", "Hem_%", "ADF_%", "Lig_%", "Cel_%", "NFC_%", "Sta_%", "EE_%", "Ash_%", "Forage_%", "TDN_%", "NEm_Mcalkg", "NEg_Mcalkg", "GE_Mcalkg"]
if fields != expected:
    raise SystemExit(f"Unexpected CSV schema: {fields!r}")
project_counts = dict(sorted(Counter(row["Project"] for row in rows).items()))
keys = [(row["Project"], row["Animal"]) for row in rows]
missing = {field: sum(not row[field].strip() for row in rows) for field in fields}
if len(rows) != 446 or len(set(keys)) != len(rows) or any(missing.values()):
    raise SystemExit("Unexpected row count, duplicate project-animal key, or missing value")

def stats(field):
    values = [float(row[field]) for row in rows]
    return {"n": len(values), "mean": statistics.mean(values), "median": statistics.median(values),
            "sampleSD": statistics.stdev(values), "min": min(values), "max": max(values)}

per_project = {}
for project in sorted(project_counts):
    subset = [row for row in rows if row["Project"] == project]
    per_project[project] = {
        "nAnimalRows": len(subset),
        "uniqueProjectAnimalKeys": len({(row["Project"], row["Animal"]) for row in subset}),
        "DMI_kg_per_day": {"mean": statistics.mean(float(row["DMI_Fin"]) for row in subset),
                            "min": min(float(row["DMI_Fin"]) for row in subset),
                            "max": max(float(row["DMI_Fin"]) for row in subset)},
    }
report = {
    "source": {"datasetDoi": manifest["datasetDoi"], "articleDoi": manifest["articleDoi"],
               "license": manifest["license"], "version": manifest["version"],
               "file": CSV_PATH.relative_to(ROOT).as_posix(), "sha256": sha,
               "sha256VerifiedAgainstDryad": True},
    "schema": fields,
    "coverage": {"nRows": len(rows), "nExperiments": len(project_counts),
                 "nUniqueProjectAnimalKeys": len(set(keys)), "projectCounts": project_counts,
                 "missingByColumn": missing, "rawAnimalIdsRepeatedAcrossProjects": True,
                 "animalIdScope": "README describes Project as the experiment code and Animal as its animal ID; raw Animal numbers repeat across projects, so use Project+Animal as the key and do not merge animals across projects."},
    "DMI_kg_per_day": stats("DMI_Fin"),
    "ADG_kg_per_day": stats("ADG_Fin"),
    "shrunkMidBodyWeight_kg": stats("SMBW_Fin"),
    "byExperiment": per_project,
    "interpretation": {
        "primaryUse": "independent fixed-default component diagnostic for daily DMI in finishing/feedlot steers",
        "notApprovedPastureCase": True,
        "dmiMeasurement": "The associated peer-reviewed paper reports DMI in kg/day; the Dryad README says feed intake was collected with SmartFeed. The CSV is one animal-by-experiment summary row, not a daily time series.",
        "engineInputsAvailable": ["observed shrunk mid-body weight"],
        "engineInputsNotRepresented": ["diet composition and treatment", "weather", "days/within-experiment intake variation"],
        "causalEffectEstimated": False,
        "uncertaintyIntervalEstimated": False,
        "calibrationPerformed": False,
        "fullEngineValidation": False,
    },
    "limitations": [
        "This is a finishing/feedlot cohort, not pasture; it cannot validate the approved USDA/CPER observational pasture case or grazing behavior.",
        "DMI is reported as a finishing-phase daily summary, not as paired daily DMI and weight trajectories.",
        "The source uses Project-local Animal IDs; the composite key is Project+Animal. Do not merge equal Animal numbers across projects.",
        "Five projects provide only five experiment-level groups; group-held-out results are exploratory and do not support calibrated uncertainty intervals.",
        "The dataset was assembled for methane-model evaluation. This audit evaluates only a fixed Agroville DMI component and makes no methane-model claim.",
        "No parameters were fit and no values were changed or removed."
    ],
}
REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"rows": len(rows), "projects": project_counts, "DMI_kg_per_day": report["DMI_kg_per_day"]}, indent=2))
