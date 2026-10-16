#!/usr/bin/env python3
"""Create the deterministic, descriptive Perea v2 sequence-readiness report."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from scripts.science.behavior.perea_time_series import readiness_report

DATA = ROOT / "data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv"
README = ROOT / "data/perea-rangeland-behavior/README_V2.txt"
OUTPUT = ROOT / "docs/evidence/perea-time-series-readiness.json"


def main() -> None:
    report = readiness_report(DATA, README)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    coverage = report["coverage"]
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {coverage['animals']} animals, "
          f"{coverage['contiguousWindows']} contiguous windows, "
          f"{coverage['complete24HourWindows']} complete 24-hour windows")


if __name__ == "__main__":
    main()
