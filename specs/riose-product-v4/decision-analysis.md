# Decision analysis

## Comparison

Reuse V3's multi-arm shared-seed/snapshot contract for illustrative FarmEngine comparison. Reuse P3-004's separate BR-CORTE multi-level calculator for conditional DMI and user-price arithmetic. Do not combine those outputs into one scientific claim.

## Sensitivity

A sensitivity request names one registered input, explicit interval, increment and fixed inputs. Validate every generated value before execution. Report the exact values, units, constants, model version and equation provenance. Plot response against input; include a local derivative only when its mathematical definition is explicit. Label as deterministic equation sensitivity, not causal response or uncertainty.

## Economics

Only calculate supplement quantity/cost from user-supplied price per kg DM, animal count and days. Missing price means cost is absent. Keep kg as dry matter explicit. No unsupported fixed costs, profit, ROI, feed conversion or production yield.

## Interpretation

A changed equation output answers “what this equation computes under changed inputs.” It does not identify an effect of an intervention in cattle. Correlation and deterministic sensitivity are not causal evidence.
