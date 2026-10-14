#!/usr/bin/env python3
"""Summarize matched captures; preserve each raw report as the authority."""
import argparse
import json
import pathlib
import statistics

parser = argparse.ArgumentParser()
parser.add_argument("directory")
args = parser.parse_args()
reports = [(path.name, json.loads(path.read_text()))
           for path in sorted(pathlib.Path(args.directory).glob("*-run-*.json"))]
if not reports:
    raise SystemExit("No captures found")
revision = reports[0][1]["benchmark"]["source"]["revision"]
hardware = reports[0][1]["hardware"]
groups = {}
dispatch = {}
for name, report in reports:
    assert report["benchmark"]["source"] == {"revision": revision, "dirty": False}, name
    assert report["hardware"] == hardware, name
    assert report["configuration"]["repetitions"] == 31, name
    assert report["configuration"]["warmupRuns"] == 5, name
    assert report["results"]["equivalence"]["bitwiseEqual"], name
    profile = report["configuration"]["flags"].split(":")[0]
    dispatch.setdefault(profile, []).append(report["results"]["selectionOverheadMs"]["median"])
    for item in report["phases"]["engine"]["measurements"]:
        key = (profile, item["dataset"], item["population"], item["metric"])
        groups.setdefault(key, {}).setdefault(item["implementation"], []).append(
            item["statistics"]["median"])
rows = []
for (profile, dataset, count, metric), implementations in sorted(groups.items()):
    medians = {name: statistics.median(values) for name, values in implementations.items()}
    row = {"profile": profile, "dataset": dataset, "animals": count, "metric": metric,
           "medianMs": medians, "captureMediansMs": implementations}
    if "current" in medians:
        row["pairedSpeedups"] = {
            name: [a / b for a, b in zip(implementations["current"], values)]
            for name, values in implementations.items() if name != "current"}
        row["medianSpeedups"] = {name: statistics.median(values)
                                for name, values in row["pairedSpeedups"].items()}
    rows.append(row)
print(json.dumps({"sourceRevision": revision, "hardware": hardware,
                  "captures": [name for name, _ in reports],
                  "dispatchSelectionMediansMs": dispatch, "rows": rows}, indent=2))
