#!/usr/bin/env python3
"""Summarize matched captures; preserve each raw report as the authority."""
import argparse
import json
import pathlib
import statistics

PROFILES = ("generic", "native", "scalar")


def load_reports(directory, runs):
    paths = sorted(pathlib.Path(directory).glob("*-run-*.json"))
    expected = {f"{profile}-run-{run}.json"
                for profile in PROFILES for run in range(1, runs + 1)}
    actual = {path.name for path in paths}
    if actual != expected:
        missing = sorted(expected - actual)
        unexpected = sorted(actual - expected)
        raise SystemExit(f"capture set mismatch: missing={missing}; unexpected={unexpected}")

    reports = []
    for path in paths:
        profile, run = path.stem.rsplit("-run-", 1)
        report = json.loads(path.read_text())
        configuration = report["configuration"]
        if configuration["flags"].split(":")[0] != profile:
            raise SystemExit(f"{path.name} declares a different compiler profile")
        if configuration["implementationOrderRotation"] != (int(run) - 1) % 4:
            raise SystemExit(f"{path.name} has an unexpected implementation order")
        reports.append((path.name, report))
    return reports


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory")
    parser.add_argument("--runs", type=int, default=4,
                        help="expected captures per compiler profile (default: 4)")
    args = parser.parse_args()
    if args.runs < 4:
        parser.error("--runs must be at least four")

    reports = load_reports(args.directory, args.runs)
    revision = reports[0][1]["benchmark"]["source"]["revision"]
    hardware = reports[0][1]["hardware"]
    groups = {}
    dispatch = {}
    for name, report in reports:
        if report["benchmark"]["source"] != {"revision": revision, "dirty": False}:
            raise SystemExit(f"{name}: capture source must be clean and match revision {revision}")
        if report["hardware"] != hardware:
            raise SystemExit(f"{name}: capture hardware does not match the other reports")
        if report["configuration"]["repetitions"] != 31:
            raise SystemExit(f"{name}: expected 31 timed repetitions")
        if report["configuration"]["warmupRuns"] != 5:
            raise SystemExit(f"{name}: expected five warmup runs")
        if not report["results"]["equivalence"]["bitwiseEqual"]:
            raise SystemExit(f"{name}: implementations failed bitwise equivalence")
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


if __name__ == "__main__":
    main()
