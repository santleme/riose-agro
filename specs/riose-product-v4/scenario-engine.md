# Scenario engine architecture

V4 uses the existing seams:

1. Prompt/manual form creates a draft only.
2. Strict client validation and applicable model lookup.
3. Review surface shows all inputs, assumptions, units, provenance and unsupported requests.
4. Explicit user action dispatches a Worker for FarmEngine scenario sets, or invokes the registered deterministic BR-CORTE model for scalar/sensitivity calculations.
5. Actual outputs, never placeholder estimates, feed tables and charts.
6. Export/replay stores versioned input contract, exact model/executor identity, units and hashes where supported.

`riose-scenario-set/v1` and `riose-br-corte-dmi-scenario-set/1` remain distinct. A common axis can only compare outputs with the same model definition, unit, population semantics and time basis. FarmEngine does not become a BR-CORTE arm. Sensitivity is one input sweep at a time; it does not mutate engine equations. Keep calculations off the main thread if measured workload warrants it; current BR-CORTE sweep is bounded to at most 101 quick equation calls.
