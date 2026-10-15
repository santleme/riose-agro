# Riose V4 — neutral demonstration script

**Length:** 7 minutes within the exploratory interview. Use the current local Product V3/V4 scenario lab; no provider or paid service is needed.

## Set-up

- Start at the empty scenario-lab state. Tell the participant examples are generated inputs, not observations.
- Ask the participant to describe a recent use case in their own words. Do not use a scenario the participant did not supply as if it were theirs.
- If demonstrating with the checked-in BR-CORTE example, say it is a worked product example: representative BW 400 kg, supplied ADG 0.5 kg/day, supplement levels entered explicitly, 200 represented animals and 30 days. It is not their herd or an observed cohort. Do not show a price unless the participant supplies an appropriate price per kg DM and currency.

## Actions and words

1. Show that scientific fields start blank. Say: “The fields stay empty until you provide inputs or explicitly load this example.”
2. Enter only participant-supplied values, or explicitly load the marked example. Show the review card before calculation. Ask the participant to check BW, supplied ADG, units, animal count, horizon, supplement levels and price basis.
3. Calculate the BR-CORTE scenarios, then the requested one-factor supplement sweep. Point out the model/version, input domain, fixed inputs, table, curve, and cost omission when no price is entered.
4. State: “This is the equation's conditional total DMI for these inputs. ADG is supplied, not predicted; this is not observed forage intake, a causal effect, a gain forecast, profit, or a probability range.”
5. Ask the participant to explain the result and limitations back in their own words before adding clarification.

Do not use FarmEngine curves to support the BR-CORTE claim. If showing FarmEngine separately, identify it first as deterministic illustrative behavior and keep its output outside this scientific calculation.
