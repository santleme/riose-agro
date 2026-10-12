# Reproducible scenario test harness

The harness runs local deterministic farm scenarios from JSON files. It uses the existing FarmEngine; a scenario run makes no network, language-model, or GPU calls.

## Run

Install the locked development dependencies once. Then use:

~~~sh
npm run test:scenarios
npm run scenarios
~~~

The second command reads every *.json file in tests/scenarios/. Optional positional arguments select the scenario directory and result directory:

~~~sh
npm run scenarios -- tests/scenarios .test-results/scenarios
~~~

Each scenario is reported as PASS or FAIL. Its detailed output is written as <fixture>.result.json in .test-results/scenarios/. Failed or malformed scenarios receive a diagnostic result and do not stop the remaining files; the process exits non-zero when any scenario fails. An absent directory or a directory with no JSON fixtures is reported as a runner-level error.

## Scenario format

schemas/scenario.schema.json is the input contract. Each file contains a scenarioId, deterministic engine seed and animal count, optional supported configuration, run duration in hours, and assertions against the output:

~~~json
{
  "scenarioId": "baseline-pasture",
  "engine": {"seed": 417, "animalCount": 3},
  "configuration": {
    "diet": "pasture",
    "housing": "pasture",
    "weather": "normal",
    "supplement": 0
  },
  "run": {"hours": 24},
  "assertions": [
    {"path": "/state/hour", "operator": "equals", "value": 30},
    {"path": "/metrics/weight", "operator": "greaterThan", "value": 300},
    {
      "path": "/metrics/weight",
      "operator": "approximatelyEquals",
      "value": 350.24,
      "tolerance": 0.01
    }
  ]
}
~~~

JSON Pointer paths address state or metrics in the captured result. Operators are equals, greaterThan, lessThan, and approximatelyEquals. The last operator accepts a non-negative tolerance and defaults to 1e-6; ordered comparisons require a numeric expected value. Assertion failures include the path, expected value, and actual value.

Each result JSON records formatVersion, scenarioId, overall passed state, errors, the per-assertion reports, original input, and captured engine result. Per-assertion reports record path, operator, expected and actual values, pass state, and a readable message.

## Add a scenario

Add another JSON fixture to tests/scenarios/. The runner discovers and sorts files automatically; no runner code changes are needed. Keep assertions aligned with exact deterministic output and treat the simulated values as illustrative rather than scientific validation.
