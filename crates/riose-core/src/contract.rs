//! Explicit input/output contract for native demonstrative scenario runs.

use crate::{compare_housing, FarmConfig, FarmEngine, FarmMetrics, FarmSnapshot, HousingComparison};
use serde::{Deserialize, Serialize};

pub const NATIVE_SCENARIO_VERSION: u16 = 1;
pub const NATIVE_ENGINE_VERSION: &str = concat!("riose-core/", env!("CARGO_PKG_VERSION"));
pub const MODEL_STATUS: &str = "demonstrative_unvalidated";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum NativeScenarioRequest {
    Baseline {
        version: u16,
        seed: u32,
        #[serde(rename = "animalCount")]
        animal_count: usize,
        configuration: FarmConfig,
        hours: u32,
    },
    HousingComparison {
        version: u16,
        snapshot: FarmSnapshot,
        days: u32,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EngineMetadata {
    pub engine_version: String,
    pub build_id: String,
    pub model_status: String,
    pub provenance: String,
    pub validated: bool,
}

impl Default for EngineMetadata {
    fn default() -> Self {
        Self {
            engine_version: NATIVE_ENGINE_VERSION.to_owned(),
            build_id: option_env!("RIOSE_BUILD_ID").unwrap_or("unspecified").to_owned(),
            model_status: MODEL_STATUS.to_owned(),
            provenance: "native-rust-core".to_owned(),
            validated: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum NativeScenarioResult {
    Baseline {
        snapshot: FarmSnapshot,
        metrics: FarmMetrics,
    },
    HousingComparison {
        comparison: HousingComparison,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRunResult {
    pub version: u16,
    pub engine: EngineMetadata,
    pub result: NativeScenarioResult,
}

pub fn run_native_scenario(request: NativeScenarioRequest) -> Result<NativeRunResult, String> {
    let result = match request {
        NativeScenarioRequest::Baseline { version, seed, animal_count, configuration, hours } => {
            validate_version(version)?;
            let mut engine = FarmEngine::new(seed, animal_count)?;
            engine.configure(configuration)?;
            engine.tick(hours)?;
            NativeScenarioResult::Baseline {
                snapshot: engine.snapshot(),
                metrics: engine.metrics(),
            }
        }
        NativeScenarioRequest::HousingComparison { version, snapshot, days } => {
            validate_version(version)?;
            NativeScenarioResult::HousingComparison {
                comparison: compare_housing(&snapshot, days)?,
            }
        }
    };
    Ok(NativeRunResult {
        version: NATIVE_SCENARIO_VERSION,
        engine: EngineMetadata::default(),
        result,
    })
}

fn validate_version(version: u16) -> Result<(), String> {
    if version != NATIVE_SCENARIO_VERSION {
        return Err(format!("unsupported native scenario version: {version}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scenario_boundary_rejects_unknown_fields_instead_of_ignoring_them() {
        let error = serde_json::from_str::<NativeScenarioRequest>(
            r#"{"type":"baseline","version":1,"seed":2026,"animalCount":2,"configuration":{"diet":"pasture","housing":"pasture","weather":"normal","supplement":0,"rainfallMm":42},"hours":24}"#,
        ).unwrap_err();
        assert!(error.to_string().contains("rainfallMm"));
    }

    #[test]
    fn baseline_results_record_engine_build_and_model_status() {
        let request = NativeScenarioRequest::Baseline {
            version: 1,
            seed: 2026,
            animal_count: 2,
            configuration: FarmConfig::default(),
            hours: 24,
        };
        let result = run_native_scenario(request).unwrap();
        assert_eq!(result.engine.model_status, MODEL_STATUS);
        assert!(!result.engine.validated);
        assert!(!result.engine.engine_version.is_empty());
        assert!(matches!(result.result, NativeScenarioResult::Baseline { .. }));
    }
}
