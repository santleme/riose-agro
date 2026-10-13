//! Strict JSON boundary for FarmEngine-compatible native snapshots.

use crate::FarmSnapshot;

#[derive(Debug)]
pub enum FarmSnapshotDecodeError {
    Json(serde_json::Error),
    Invalid(String),
}

impl std::fmt::Display for FarmSnapshotDecodeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "invalid farm snapshot JSON: {error}"),
            Self::Invalid(error) => write!(formatter, "invalid farm snapshot: {error}"),
        }
    }
}

impl std::error::Error for FarmSnapshotDecodeError {}

pub fn encode_farm_snapshot(snapshot: &FarmSnapshot) -> Result<String, serde_json::Error> {
    serde_json::to_string(snapshot)
}

pub fn decode_farm_snapshot(json: &str) -> Result<FarmSnapshot, FarmSnapshotDecodeError> {
    let snapshot: FarmSnapshot =
        serde_json::from_str(json).map_err(FarmSnapshotDecodeError::Json)?;
    snapshot
        .validate()
        .map_err(FarmSnapshotDecodeError::Invalid)?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FarmEngine;

    #[test]
    fn farm_snapshot_roundtrips_with_the_js_field_names() {
        let expected = FarmEngine::new(2026, 2).unwrap().snapshot();
        let json = encode_farm_snapshot(&expected).unwrap();
        assert!(json.contains("\"initialSeed\""));
        assert!(json.contains("\"locomotionSeed\""));
        assert!(!json.contains("\"snapshotType\""));
        assert_eq!(decode_farm_snapshot(&json).unwrap(), expected);
    }

    #[test]
    fn decodes_a_snapshot_emitted_by_the_javascript_engine() {
        let fixture = include_str!("../tests/fixtures/farm-engine-snapshot.json");
        let snapshot = decode_farm_snapshot(fixture).unwrap();
        let encoded: serde_json::Value =
            serde_json::from_str(&encode_farm_snapshot(&snapshot).unwrap()).unwrap();
        let fixture: serde_json::Value = serde_json::from_str(fixture).unwrap();

        for field in [
            "pastureKgDM",
            "barnBaseKgDM",
            "supplementKgDM",
            "dietExtraKgDM",
        ] {
            assert!(
                fixture["intake"].get(field).is_some(),
                "missing JS field {field}"
            );
            assert!(
                encoded["intake"].get(field).is_some(),
                "missing native field {field}"
            );
        }
        assert_eq!(snapshot.animals[0].name, "Aurora");
        assert_eq!(snapshot.initial_seed, 2026);
    }

    #[test]
    fn snapshot_decoder_rejects_fields_outside_the_supported_farm_contract() {
        let json = encode_farm_snapshot(&FarmEngine::new(2026, 1).unwrap().snapshot())
            .unwrap()
            .replace("\"hour\":6", "\"hour\":6,\"rainfallMm\":40");
        let error = decode_farm_snapshot(&json).unwrap_err().to_string();
        assert!(error.contains("rainfallMm"));
    }

    #[test]
    fn legacy_snapshots_derive_only_the_two_rng_metadata_fields_as_js_does() {
        let snapshot = FarmEngine::new(2026, 1).unwrap().snapshot();
        let mut value: serde_json::Value =
            serde_json::from_str(&encode_farm_snapshot(&snapshot).unwrap()).unwrap();
        value.as_object_mut().unwrap().remove("initialSeed");
        value.as_object_mut().unwrap().remove("locomotionSeed");
        let decoded = decode_farm_snapshot(&serde_json::to_string(&value).unwrap()).unwrap();
        assert_eq!(decoded.initial_seed, snapshot.seed);
        assert_eq!(
            decoded.locomotion_seed,
            crate::derive_locomotion_seed(snapshot.seed)
        );
    }
}
