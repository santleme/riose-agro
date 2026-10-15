#!/usr/bin/env python3
"""Evaluate the frozen semi-Markov candidate on development folds only."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from scripts.science.behavior.evaluate_perea_sequence_baselines import ROOT, evaluate

OUTPUT = ROOT / "docs/evidence/perea-semimarkov-development-v1.json"


def main():
    report = evaluate(include_semimarkov=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    gate = report["development"]["semiMarkovGate"]
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: semi-Markov development gate pass={gate['pass']}; "
          "confirmatory holdout scores not computed")


if __name__ == "__main__":
    main()
