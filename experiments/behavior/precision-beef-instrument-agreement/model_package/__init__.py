"""Standalone experimental Precision Beef inference package; not wired to Riose."""

from .inference import load_model, predict_features

__all__ = ["load_model", "predict_features"]
