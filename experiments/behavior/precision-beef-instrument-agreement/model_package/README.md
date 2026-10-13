# Precision Beef experimental behavior model package

This package is kept separate from the diagnostic evaluator and from the Riose application. It contains a development-only trainer, a JSON model artifact, a dependency-light inference API, and a small standalone CLI. It is not connected to FarmEngine, `app.js`, or the Rust core.

## Scientific scope

The target is the unique majority class supplied by the RumiWatch halter in one shared 90-second wall-clock window. The model consumes twelve collar-only axis summary features (`x/y/z` mean, population SD, minimum, maximum; mg). It predicts the source's instrument-derived labels `other`, `rumination`, or `eating_or_drinking`; drinking is merged into eating by the source.

The cohort comprises housed finishing steers in the Precision Beef source dataset. This artifact does not predict behavior for grazing cattle, DMI, ADG, or validate Riose or any farm-level simulation. The RumiWatch target is not human-video-confirmed ground truth.

## Training and artifact

The trainer opens only the 15 `source_train` animal Parquet files. It never opens the held-out source-test files for animals 04, 10, and 11. Every input Parquet is verified against the existing 90-second processing report. It applies the preregistered Random Forest settings and equal-total-weight-per-animal procedure without search or parameter tuning.

Run from the repository root with the exact experiment environment:

```bash
uv run --python 3.12 --with-requirements experiments/behavior/precision-beef-instrument-agreement/requirements.txt \
  python experiments/behavior/precision-beef-instrument-agreement/train_behavior_artifact.py
```

The artifact is gzip-compressed JSON containing only tree arrays and metadata, not executable pickle. Its adjacent manifest records the artifact SHA-256, exact training animal IDs, input Parquet checksums, Python/library versions, source license, and the excluded holdout animals. Training requires scikit-learn 1.5.2 as pinned in `requirements.txt`.

## Inference

The Python API is `model_package.load_model()` plus `model_package.predict_features()`. It checks artifact integrity, enforces the exact twelve-feature contract and finite numeric inputs, and returns the predicted class and model/source/scope provenance. It does not return a calibrated probability or confidence score.

The CLI accepts a JSON object containing the twelve feature names directly, or under a `features` property. `example_features.json` contains a feature vector from one processed development-animal window:

```bash
python experiments/behavior/precision-beef-instrument-agreement/predict_behavior.py input.json
```

Input values use the feature unit **mg** and must describe one eligible 90-second window using the same aggregation convention as the source processing pipeline.

## Tests

```bash
uv run --python 3.12 --with-requirements experiments/behavior/precision-beef-instrument-agreement/requirements.txt \
  python -m unittest discover -s experiments/behavior/precision-beef-instrument-agreement -p 'test_model_package.py' -v
```

The focused tests cover deterministic JSON-tree inference, provenance, feature validation, SHA-256 enforcement, and rejection of held-out test rows by the trainer. The existing instrument-agreement evaluation remains a separate command and report; this package does not run or change that evaluation.
