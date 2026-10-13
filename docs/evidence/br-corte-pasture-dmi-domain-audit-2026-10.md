# BR-CORTE pasture DMI equation: domain audit

Reviewed 2026-10-13 against the official BR-CORTE 2023 Chapter 2, Eq. 2.6, its validation tables, recommendation text, and worked example.

## Implemented equation and units

The Riose pasture implementation transcribes total dry matter intake as:

```text
CMS = -0.4684 + 0.7732·CMSs + 0.0742·BW^0.75 + 0.7953·ADG - 0.9047·ADG²
```

CMS and supplement CMSs are kg DM/day, BW is mean body weight in kg, and ADG is kg/day. The implemented test vector for 400 kg BW, 0.5 kg/day ADG, and 1.6 kg DM/day supplement returns 7.58 kg DM/day, matching Table 2.14; boundary vectors also reproduce the published calculation.

## What the published evidence supports

The equation is for growing Zebu cattle on tropical pasture with supplementation, under the recommendation and conditions described in the chapter. The development fit (R² = 0.638, 1,069 experimental units) is not independent validation. The chapter reports a separate validation bank of 174 Zebu experimental units, with mean BW 311 kg, mean ADG 0.56 kg/day, and mean total DMI 6.65 kg/day; reported validation statistics include R² = 0.670, mean bias +0.761 kg/day, and CCC = 0.741.

The equation conditions on supplied ADG. It does not predict ADG. Subtracting supplement DMI from total DMI yields an arithmetic residual, not a separately measured forage-intake outcome. The equation and its numeric marginal ranges do not establish applicability to mature beef cows or validate individual predictions for that population.

## Product and evidence boundary

Equation-based pasture scenarios remain useful when labeled as conditional estimates within the published domain. The available evidence does not support individual adult-cow DMI accuracy, probabilistic intervals, pasture-stock accuracy, weight trajectories under forage deficit, or full-engine counterfactual validity. Accordingly, the mature beef-cow pasture total-DMI gate remains `NO_GO`; this equation audit does not change that decision.

## Sources

- BR-CORTE 2023, Chapter 2, Eq. 2.6, validation Tables 2.12–2.13, and worked Table 2.14: [official chapter PDF](https://brcorte.com.br/assets/book2023/br/02.pdf).
- Implementation and adapter: `scientific/br_corte_pasture_dmi.js` and the corresponding pasture-DMI adapter.
- Regression vectors: `tests/br-corte-pasture-dmi.test.js`.
