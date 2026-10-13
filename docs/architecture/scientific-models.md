# Scientific models and evidence

The current animal weight, intake, pasture growth, stress and cost rules are illustrative assumptions. Existing UI/docs label them demonstrative and unvalidated. The Rust kernel is a direct implementation of the existing weight/energy formula; moving it does not calibrate, validate or improve the scientific status of that model.

## Model record contract

Each model release should carry:

- stable model ID and semantic version;
- domain, purpose and population of applicability;
- required inputs, physical units and accepted ranges;
- parameters with source, license and provenance;
- temporal/spatial resolution and execution order;
- outputs, units and missing-value behavior;
- assumptions, known limitations and uncertainty method;
- evidence references and validation status (`demonstrative`, `hypothesis`, `observational`, `calibrated`, or `validated` as applicable);
- source code and build/runtime version.

Python remains the home for exploratory data analysis, statistical calibration, holdout evaluation and uncertainty analysis. Rust may host a production/runtime kernel after the model is reviewed and its inputs are available at execution time. Do not infer causal effects from observational associations, and do not merge worktree datasets into a model without provenance and review.

The repository-wide audit records earlier uncommitted science/data work; subsequent main commits integrated research artifacts and transport audits. Keep their provenance and validation status explicit, and do not treat candidate datasets as model validation or duplicate existing extractors.
