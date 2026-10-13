//! BR-CORTE 2023, Chapter 2, Equation 2.6 scalar total-DMI calculation.
//!
//! This published equation applies to growing Zebu cattle grazing tropical
//! pasture with supplementation. ADG is an input assumption; it is not
//! predicted by the equation. A Rust implementation does not independently
//! validate Riose predictions, and this equation is not an adult-cow model.

use serde::{Deserialize, Serialize};

pub const BR_CORTE_DMI_MODEL_ID: &str = "br-corte-2023-eq-2.6";
pub const BR_CORTE_DMI_MODEL_VERSION: &str = "2023";
pub const BR_CORTE_DMI_SOURCE: &str = "https://brcorte.com.br/assets/book2023/br/02.pdf";
pub const BR_CORTE_DMI_EQUATION: &str =
    "DMI = -0.4684 + 0.7732 × supplement + 0.0742 × BW^0.75 + 0.7953 × ADG - 0.9047 × ADG²";
pub const BR_CORTE_DMI_PRODUCTION_SYSTEM: &str =
    "growing Zebu cattle grazing tropical pasture with supplementation";
pub const BR_CORTE_DMI_R_SQUARED: f64 = 0.638;
pub const BR_CORTE_DMI_VALIDATION_UNITS: u32 = 174;

pub const BODY_WEIGHT_KG_RANGE: [f64; 2] = [133.0, 474.0];
pub const ADG_KG_PER_DAY_RANGE: [f64; 2] = [-0.18, 1.34];
pub const SUPPLEMENT_KG_DM_PER_DAY_RANGE: [f64; 2] = [0.0, 5.32];

#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrCortePastureDmiInput {
    pub body_weight_kg: f64,
    pub adg_kg_per_day: f64,
    #[serde(rename = "supplementKgDMPerDay")]
    pub supplement_kg_dm_per_day: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrCortePastureDmiPrediction {
    #[serde(rename = "totalDmiKgDMPerDay")]
    pub total_dmi_kg_dm_per_day: f64,
    #[serde(rename = "supplementKgDMPerDay")]
    pub supplement_kg_dm_per_day: f64,
    #[serde(rename = "residualForageDmiKgDMPerDay")]
    pub residual_forage_dmi_kg_dm_per_day: f64,
    pub in_validated_domain: bool,
    pub evidence_status: String,
    pub adg_role: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrCortePastureDmiMetadata {
    pub model_id: String,
    pub model_version: String,
    pub source: String,
    pub equation: String,
    pub production_system: String,
    pub r_squared: f64,
    pub validation_animal_units: u32,
    pub units: BrCortePastureDmiUnits,
    pub validated_domain: BrCortePastureDmiDomain,
    pub riose_validation: String,
    pub limitation: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrCortePastureDmiUnits {
    pub body_weight_kg: String,
    pub adg_kg_per_day: String,
    #[serde(rename = "supplementKgDMPerDay")]
    pub supplement_kg_dm_per_day: String,
    #[serde(rename = "dmiKgDMPerDay")]
    pub dmi_kg_dm_per_day: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BrCortePastureDmiDomain {
    pub body_weight_kg: [f64; 2],
    pub adg_kg_per_day: [f64; 2],
    #[serde(rename = "supplementKgDMPerDay")]
    pub supplement_kg_dm_per_day: [f64; 2],
    pub production_system: String,
}

impl Default for BrCortePastureDmiMetadata {
    fn default() -> Self {
        Self {
            model_id: BR_CORTE_DMI_MODEL_ID.to_owned(),
            model_version: BR_CORTE_DMI_MODEL_VERSION.to_owned(),
            source: BR_CORTE_DMI_SOURCE.to_owned(),
            equation: BR_CORTE_DMI_EQUATION.to_owned(),
            production_system: BR_CORTE_DMI_PRODUCTION_SYSTEM.to_owned(),
            r_squared: BR_CORTE_DMI_R_SQUARED,
            validation_animal_units: BR_CORTE_DMI_VALIDATION_UNITS,
            units: BrCortePastureDmiUnits {
                body_weight_kg: "kg".to_owned(),
                adg_kg_per_day: "kg/day".to_owned(),
                supplement_kg_dm_per_day: "kg DM/day".to_owned(),
                dmi_kg_dm_per_day: "kg DM/day".to_owned(),
            },
            validated_domain: BrCortePastureDmiDomain {
                body_weight_kg: BODY_WEIGHT_KG_RANGE,
                adg_kg_per_day: ADG_KG_PER_DAY_RANGE,
                supplement_kg_dm_per_day: SUPPLEMENT_KG_DM_PER_DAY_RANGE,
                production_system: BR_CORTE_DMI_PRODUCTION_SYSTEM.to_owned(),
            },
            riose_validation: "not independently validated for Riose".to_owned(),
            limitation: "This equation is not applicable to mature beef cows; ADG is an input assumption and is not predicted.".to_owned(),
        }
    }
}

/// Evaluate the published equation after requiring every input to lie within
/// its independently reported validation range.
pub fn predict_pasture_dmi(
    input: BrCortePastureDmiInput,
) -> Result<BrCortePastureDmiPrediction, String> {
    validate_range("bodyWeightKg", input.body_weight_kg, BODY_WEIGHT_KG_RANGE)?;
    validate_range("adgKgPerDay", input.adg_kg_per_day, ADG_KG_PER_DAY_RANGE)?;
    validate_range(
        "supplementKgDMPerDay",
        input.supplement_kg_dm_per_day,
        SUPPLEMENT_KG_DM_PER_DAY_RANGE,
    )?;

    // Keep the operation order aligned with scientific/br_corte_pasture_dmi.js.
    let metabolic_weight = input.body_weight_kg.powf(0.75);
    let total_dmi = -0.4684
        + 0.7732 * input.supplement_kg_dm_per_day
        + 0.0742 * metabolic_weight
        + 0.7953 * input.adg_kg_per_day
        - 0.9047 * input.adg_kg_per_day.powi(2);
    if !total_dmi.is_finite() || total_dmi <= 0.0 {
        return Err("BR-CORTE equation returned a non-positive or non-finite DMI".to_owned());
    }

    Ok(BrCortePastureDmiPrediction {
        total_dmi_kg_dm_per_day: total_dmi,
        supplement_kg_dm_per_day: input.supplement_kg_dm_per_day,
        residual_forage_dmi_kg_dm_per_day: (total_dmi - input.supplement_kg_dm_per_day).max(0.0),
        in_validated_domain: true,
        evidence_status: "within-independent-validation-ranges".to_owned(),
        adg_role: "input-assumption; not predicted by this equation".to_owned(),
    })
}

fn validate_range(name: &str, value: f64, range: [f64; 2]) -> Result<(), String> {
    if !value.is_finite() {
        return Err(format!("{name} must be a finite number"));
    }
    if value < range[0] || value > range[1] {
        return Err(format!(
            "{name} must be within the BR-CORTE validation range [{}, {}]",
            range[0], range[1]
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const JS_VECTORS: &str = include_str!("../../../tests/fixtures/br-corte-eq26-parity-v1.json");

    #[test]
    fn matches_javascript_reference_vectors_within_cross_runtime_precision() {
        let vectors: Value = serde_json::from_str(JS_VECTORS).unwrap();
        assert_eq!(
            vectors["sourceImplementation"],
            "scientific/br_corte_pasture_dmi.js"
        );
        for vector in vectors["vectors"].as_array().unwrap() {
            let input: BrCortePastureDmiInput =
                serde_json::from_value(vector["inputs"].clone()).unwrap();
            let actual = predict_pasture_dmi(input).unwrap();
            let expected = &vector["expected"];
            let actual_json = serde_json::to_value(actual).unwrap();
            for field in ["totalDmiKgDMPerDay", "residualForageDmiKgDMPerDay"] {
                let delta = (actual_json[field].as_f64().unwrap()
                    - expected[field].as_f64().unwrap())
                .abs();
                assert!(
                    delta <= 1e-12,
                    "{} {field} differs by {delta}",
                    vector["id"]
                );
            }
            assert_eq!(
                actual_json["supplementKgDMPerDay"].as_f64(),
                expected["supplementKgDMPerDay"].as_f64()
            );
            assert_eq!(
                actual_json["inValidatedDomain"],
                expected["inValidatedDomain"]
            );
            assert_eq!(actual_json["evidenceStatus"], expected["evidenceStatus"]);
            assert_eq!(actual_json["adgRole"], expected["adgRole"]);
        }
    }

    #[test]
    fn accepts_inclusive_domain_boundaries_and_rejects_values_outside_them() {
        for input in [
            BrCortePastureDmiInput {
                body_weight_kg: 133.0,
                adg_kg_per_day: -0.18,
                supplement_kg_dm_per_day: 0.0,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 474.0,
                adg_kg_per_day: 1.34,
                supplement_kg_dm_per_day: 5.32,
            },
        ] {
            assert!(predict_pasture_dmi(input).unwrap().in_validated_domain);
        }
        for input in [
            BrCortePastureDmiInput {
                body_weight_kg: 132.999,
                adg_kg_per_day: 0.5,
                supplement_kg_dm_per_day: 1.0,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 474.001,
                adg_kg_per_day: 0.5,
                supplement_kg_dm_per_day: 1.0,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 300.0,
                adg_kg_per_day: -0.181,
                supplement_kg_dm_per_day: 1.0,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 300.0,
                adg_kg_per_day: 1.341,
                supplement_kg_dm_per_day: 1.0,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 300.0,
                adg_kg_per_day: 0.5,
                supplement_kg_dm_per_day: -0.001,
            },
            BrCortePastureDmiInput {
                body_weight_kg: 300.0,
                adg_kg_per_day: 0.5,
                supplement_kg_dm_per_day: 5.321,
            },
        ] {
            assert!(predict_pasture_dmi(input).is_err());
        }
    }
}
