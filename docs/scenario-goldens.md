# JavaScript scenario goldens

The version 1 fixtures under `tests/scenario-goldens/` record the current fixed-seed JavaScript behavior for the executable `baseline-pasture` harness case and the supported `housing-comparison` preset. They are compatibility contracts for replay and refactoring work; they do not establish scientific calibration or validity.

The baseline harness runs seed `417`, three animals, and 24 hours. The `baseline` preset itself currently resets to its reproducible initial snapshot; its catalog's 30-day duration does not cause a simulation run. The housing comparison runs seed `2026`, 24 animals, and 30 days.

Fixtures record the generator and engine contract versions, scenario identity, seed and horizon, and exact JavaScript outputs. The baseline fixture includes the final state and metrics, including both RNG stream states, ordered events, and chronological animal histories. The housing fixture includes its initial replay manifest, every day row in order, final comparison metrics, and both arms' endpoint state projections. Numeric values are compared exactly; no floating-point tolerance is declared.

Regenerate with:

```sh
node scripts/generate-scenario-goldens.js --write
```

The generator reuses the scenario harness, supported preset runner, and scenario contract replay API. It rejects unsupported presets. It emits no timestamps, generated-at values, filesystem paths, or random run IDs. To review an update, regenerate twice, confirm the second run creates no additional diff, and inspect every changed fixture value against the JavaScript engine behavior. Update a golden only when an intentional compatibility change is understood and reviewed. Passing these fixtures proves deterministic software/replay compatibility for the recorded inputs; it does not prove biological accuracy, calibration, or scientific validity.
