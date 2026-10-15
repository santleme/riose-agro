# BEH-010 — Versioned behavioral-agent component boundary v1

**Status: architecture contract only.** No new biological behavior policy or physiology model is approved by this document. The default FarmEngine remains the demonstrative baseline and retains its existing behavior and outputs.

## Component graph

`EnvironmentSnapshot → BehaviorPolicy → latent activity sequence → ObservationModel → observation/classifier outputs`

`EnvironmentSnapshot + animal inputs → PhysiologicalState`

`InterventionSpecification + evidence-qualified population/outcome → InterventionModel effect`

These edges describe data interfaces, not presently available model implementations. A component can abstain as `unsupported`; absence of evidence is not filled with defaults. Interventions do not silently feed behavior or physiology. Coupling requires a separately frozen evidence and evaluation gate.

## Component responsibilities

| Interface | Owns | Must not claim |
|---|---|---|
| `riose.behavior-policy/v1` | Distribution over an explicitly named activity ontology and optional episode durations; context/seed only when supported and declared | Weight, DMI, ADG, thirst, health, intervention effect, or equivalence to FarmEngine action labels |
| `riose.physiological-state/v1` | Versioned animal-state variables, units, and equation/evidence references from a declared model or existing FarmEngine execution | A new equation, calibrated biological validity, or extrapolation beyond its model domain |
| `riose.environment-snapshot/v1` | Time-indexed environment values plus measurement/configuration/estimate status, units, and provenance | Unobserved paddock, weather, forage stock, or animal exposure |
| `riose.observation-model/v1` | Explicit stage `latent`, `human_annotated`, or `classifier_output`; ontology and transformation provenance | Treating labels/predictions as truth or generated samples as observation |
| `riose.intervention-effect/v1` | Declared comparator, target outcome/units, design, population, estimator and evidence status; unsupported effect is `null` | Causal effect without a compatible intervention design, or behavior-to-intake/weight effects inferred from sequence similarity |

## Shared envelope and compatibility rules

- Machine schema: [`schemas/behavioral-agent-interfaces-v1.schema.json`](../../schemas/behavioral-agent-interfaces-v1.schema.json). Each interface identifier includes `/v1`; breaking changes require `/v2` and explicit migration.
- Each message names its implementation/model version, evidence references, domain, subject/population, time basis, and limitations. Numeric measurements always include a unit and origin/status.
- Time envelopes declare `offsetStatus=explicit|unknown`. Unknown-offset observations preserve ISO local wall-clock strings and the source timezone label without UTC conversion; record timestamps must use the same time basis. This supports the Perea source's Mountain wall-clock values without inventing a DST offset/fold.
- Behavior ontology IDs and versions are mandatory. Perea `WA/GR/RE/RU` and FarmEngine action IDs are separate ontologies. Unknown labels are preserved as unknown/unmapped; no adapter may equate them implicitly.
- Animal identity and timestamps must survive component boundaries. Timezone and observation interval/censoring metadata must not be discarded when present.
- `status=unsupported` or `status=not_available` requires a null numerical result. No fake fill values.
- Behavior, physiology and intervention outputs cannot be joined by matching only cohort names; they need compatible individual/time/population keys and explicit evidence fit.
- No LLM runs inside a per-animal or per-tick component. The research assistant can retrieve metadata and explain registered results, but never mutates any component output.

## Current implementation status

- Behavior policy: current Perea semi-Markov candidate is `NO_GO_AFTER_INTERNAL_CONFIRMATORY`; research-only, detached, not integrated.
- Physiology: existing deterministic JS/Rust/WASM FarmEngine remains the configured demonstrative simulator. Its existing contract is not upgraded or relabeled by this SDD.
- Environment: a scenario configuration is not an observation. Inputs need explicit `configured`, `observed`, or `estimated` provenance.
- Observation: Perea's labels are human-reviewed but sampled and subject to carry-forward; classifier OOF scores are an agreement result only.
- Intervention: no evidence in the current Perea behavior dataset estimates supplementation, heat, forage or management effects. Status is unsupported.

## Acceptance boundary

Schema tests check version, provenance, ontology, units and unsupported-value behavior. They validate software shape only, not scientific truth. Before any implementation connects these components, add an ADR, model-specific applicability table, frozen evaluation protocol and independent scientific review gate.
