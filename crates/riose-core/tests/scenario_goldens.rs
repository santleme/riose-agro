use riose_core::{
    run_native_scenario, FarmConfig, FarmEngine, FarmSnapshot, NativeScenarioRequest,
    NativeScenarioResult,
};
use serde_json::{json, Value};

const BASELINE_GOLDEN: &str = include_str!("../../../tests/scenario-goldens/baseline-pasture.json");
const HOUSING_GOLDEN: &str =
    include_str!("../../../tests/scenario-goldens/housing-comparison.json");

fn parse_golden(contents: &str) -> Value {
    serde_json::from_str(contents).expect("official scenario golden must be valid JSON")
}

#[test]
fn native_baseline_matches_the_official_seed_417_24_hour_golden_exactly() {
    let golden = parse_golden(BASELINE_GOLDEN);
    assert_eq!(golden["scenarioId"], "baseline-pasture");
    assert_eq!(golden["seed"], 417);
    assert_eq!(golden["horizon"], json!({"value": 24, "unit": "hour"}));

    let request = NativeScenarioRequest::Baseline {
        version: 1,
        seed: 417,
        animal_count: golden["animalCount"].as_u64().unwrap() as usize,
        configuration: serde_json::from_value::<FarmConfig>(golden["configuration"].clone())
            .expect("official baseline configuration must be supported"),
        hours: 24,
    };
    let first = run_native_scenario(request.clone()).expect("native baseline must run");
    let second = run_native_scenario(request).expect("native baseline must rerun");
    assert_eq!(
        serde_json::to_value(&first).unwrap(),
        serde_json::to_value(&second).unwrap()
    );

    let NativeScenarioResult::Baseline { snapshot, metrics } = first.result else {
        panic!("baseline request must return baseline result");
    };
    assert_exact_json(
        &serde_json::to_value(snapshot).unwrap(),
        &golden["output"]["state"],
        "baseline state",
    );
    assert_eq!(
        serde_json::to_value(metrics).unwrap(),
        golden["output"]["metrics"]
    );
}

#[test]
fn native_housing_comparison_matches_the_official_seed_2026_30_day_golden_exactly() {
    let golden = parse_golden(HOUSING_GOLDEN);
    let manifest = &golden["replayManifest"];
    assert_eq!(golden["scenarioId"], "housing-comparison");
    assert_eq!(golden["seed"], 2026);
    assert_eq!(golden["horizon"], json!({"value": 30, "unit": "day"}));

    let snapshot = serde_json::from_value::<FarmSnapshot>(manifest["baseline"].clone())
        .expect("official housing baseline snapshot must be supported");
    assert_eq!(snapshot.initial_seed, 2026);
    let request = NativeScenarioRequest::HousingComparison {
        version: 1,
        snapshot: snapshot.clone(),
        days: 30,
    };
    let first = run_native_scenario(request.clone()).expect("native housing comparison must run");
    let second = run_native_scenario(request).expect("native housing comparison must rerun");
    assert_eq!(
        serde_json::to_value(&first).unwrap(),
        serde_json::to_value(&second).unwrap()
    );

    let NativeScenarioResult::HousingComparison { comparison } = first.result else {
        panic!("housing-comparison request must return housing-comparison result");
    };
    assert_exact_json(
        &serde_json::to_value(comparison).unwrap(),
        &golden["output"],
        "housing comparison",
    );

    let days_in_hours = 30 * 24;
    for arm in ["baseline", "scenario"] {
        let mut engine = FarmEngine::from_snapshot(snapshot.clone()).unwrap();
        let config_key = if arm == "baseline" {
            "baseline_config"
        } else {
            "scenario_config"
        };
        let config = serde_json::from_value::<FarmConfig>(manifest["inputs"][config_key].clone())
            .expect("official comparison configuration must be supported");
        engine.configure(config).unwrap();
        engine.tick(days_in_hours).unwrap();
        let actual = endpoint_projection(&engine);
        assert_eq!(
            actual, golden["endpoints"][arm],
            "{arm} endpoint must match the official golden"
        );
    }
}

#[test]
fn native_api_rejects_unsupported_scenario_variants_explicitly() {
    let error =
        serde_json::from_str::<NativeScenarioRequest>(r#"{"type":"heat","version":1,"seed":2026}"#)
            .unwrap_err();
    assert!(
        error.to_string().contains("heat"),
        "unexpected error: {error}"
    );
}

#[test]
fn native_api_rejects_unsupported_request_versions_explicitly() {
    let request = NativeScenarioRequest::Baseline {
        version: 2,
        seed: 417,
        animal_count: 3,
        configuration: FarmConfig::default(),
        hours: 24,
    };
    let error = run_native_scenario(request).unwrap_err();
    assert!(error.contains("version: 2"), "unexpected error: {error}");
}

fn endpoint_projection(engine: &FarmEngine) -> Value {
    let snapshot = serde_json::to_value(engine.snapshot()).unwrap();
    json!({
        "hour": snapshot["hour"],
        "seed": snapshot["seed"],
        "initialSeed": snapshot["initialSeed"],
        "locomotionSeed": snapshot["locomotionSeed"],
        "config": snapshot["config"],
        "animals": snapshot["animals"].as_array().unwrap().iter().map(|animal| json!({
            "id": animal["id"],
            "weight": animal["weight"],
            "initialWeight": animal["initialWeight"],
            "energy": animal["energy"],
            "thirst": animal["thirst"],
            "action": animal["action"],
            "patch": animal["patch"],
        })).collect::<Vec<_>>(),
        "pastures": snapshot["pastures"],
        "intake": snapshot["intake"],
        "cost": snapshot["cost"],
        "metrics": serde_json::to_value(engine.metrics()).unwrap(),
    })
}

fn assert_exact_json(actual: &Value, expected: &Value, path: &str) {
    if actual == expected
        || (actual.is_number()
            && expected.is_number()
            && actual.as_f64() == expected.as_f64())
    {
        return;
    }
    match (actual, expected) {
        (Value::Object(actual), Value::Object(expected)) => {
            for key in actual.keys().chain(expected.keys()) {
                match (actual.get(key), expected.get(key)) {
                    (Some(actual), Some(expected)) => {
                        assert_exact_json(actual, expected, &format!("{path}.{key}"));
                    }
                    _ => panic!("{path}.{key}: actual={actual:?}, expected={expected:?}"),
                }
            }
        }
        (Value::Array(actual), Value::Array(expected)) => {
            for (index, (actual, expected)) in actual.iter().zip(expected).enumerate() {
                assert_exact_json(actual, expected, &format!("{path}[{index}]"));
            }
            assert_eq!(actual.len(), expected.len(), "{path}: array lengths differ");
        }
        _ => panic!("{path}: actual={actual}, expected={expected}"),
    }
}
