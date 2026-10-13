#!/usr/bin/env python3
"""Standalone JSON API/CLI for the experimental Precision Beef artifact."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from model_package import load_model, predict_features  # noqa: E402

DEFAULT_ARTIFACT = HERE / "artifacts/precision-beef-90s-rf-v1.json.gz"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON object containing exactly the 12 collar feature fields")
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    args = parser.parse_args()
    try:
        payload = json.loads(args.input.read_text(encoding="utf-8"))
        features = payload.get("features", payload) if isinstance(payload, dict) else None
        result = predict_features(features, load_model(args.artifact))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
