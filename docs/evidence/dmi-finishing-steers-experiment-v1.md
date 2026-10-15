# Separate finishing-steer DMI experiment

This is a bounded experiment on the open Dryad feedlot dataset [10.5061/dryad.qnk98sfsn](https://datadryad.org/dataset/doi:10.5061/dryad.qnk98sfsn), licensed CC0. It covers 446 animal-by-experiment finishing summaries across five projects. It is **not** mature beef cows on pasture and does not satisfy or replace the original #109/#110 target.

The protocol was frozen before fitting in [`experiments/dmi-finishing-steers/protocol-v1.json`](../../experiments/dmi-finishing-steers/protocol-v1.json). The target is DMI in kg DM/animal/day. Models use body weight, contemporaneous ADG, diet composition, and breed; gas-emission columns, identifiers, experiment labels, and target fields are excluded. Preprocessing is fitted within each training fold. Leave-one-Project-out evaluation holds out each of the five experiments in turn; no hyperparameter tuning or calibrated intervals were used.

| Model | Pooled out-of-fold MAE (kg DM/day) | RMSE | Bias (prediction − observed) |
|---|---:|---:|---:|
| Training-fold mean baseline | 1.200 | 1.457 | +0.025 |
| Ridge regression | 0.784 | 0.964 | −0.466 |
| Random forest | 0.727 | 0.981 | +0.081 |

These estimates are internal cross-experiment diagnostics on one deposited source, not external validation. There are only five independent experiment groups, and ADG is a contemporaneous outcome, so the models are retrospective component experiments rather than prospective deployment models. Performance varies by held-out experiment, especially the small 2024A fold (23 animals). No uncertainty intervals are reported.

The machine-readable record includes all 446 out-of-fold predictions, fold metrics, protocol and input checksums: [`dmi-finishing-steers-experiment-v1.json`](dmi-finishing-steers-experiment-v1.json). Re-run with `python3 -m venv .venv-ml && .venv-ml/bin/pip install -r requirements-research-ml.txt && .venv-ml/bin/python scripts/science/evaluations/run_finishing_steer_dmi_experiment.py`.
