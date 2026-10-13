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
    assert_exact_json(
        &serde_json::to_value(metrics).unwrap(),
        &golden["output"]["metrics"],
        "baseline metrics",
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
        assert_exact_json(
            &actual,
            &golden["endpoints"][arm],
            &format!("{arm} endpoint"),
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
    compare_exact_json(actual, expected, path).unwrap_or_else(|error| panic!("{error}"));
}

fn compare_exact_json(actual: &Value, expected: &Value, path: &str) -> Result<(), String> {
    match (actual, expected) {
        (Value::Number(actual), Value::Number(expected)) => {
            let actual = canonical_number(actual);
            let expected = canonical_number(expected);
            if actual == expected {
                Ok(())
            } else {
                Err(format!("{path}: numeric values differ ({actual} vs {expected})"))
            }
        }
        (Value::Object(actual), Value::Object(expected)) => {
            if actual.len() != expected.len() {
                return Err(format!("{path}: object field count differs"));
            }
            for (key, actual_value) in actual {
                let expected_value = expected
                    .get(key)
                    .ok_or_else(|| format!("{path}.{key}: unexpected field"))?;
                compare_exact_json(actual_value, expected_value, &format!("{path}.{key}"))?;
            }
            Ok(())
        }
        (Value::Array(actual), Value::Array(expected)) => {
            if actual.len() != expected.len() {
                return Err(format!("{path}: array lengths differ"));
            }
            for (index, (actual, expected)) in actual.iter().zip(expected).enumerate() {
                compare_exact_json(actual, expected, &format!("{path}[{index}]"))?;
            }
            Ok(())
        }
        _ if actual == expected => Ok(()),
        _ => Err(format!("{path}: values differ ({actual} vs {expected})")),
    }
}

fn canonical_number(number: &serde_json::Number) -> String {
    let source = number.to_string();
    let exponent_index = source.find(|character| character == 'e' || character == 'E');
    let (mantissa, exponent) = match exponent_index {
        Some(index) => (
            &source[..index],
            source[index + 1..]
                .parse::<i64>()
                .expect("serde_json numbers have a valid exponent"),
        ),
        None => (source.as_str(), 0),
    };
    let negative = mantissa.starts_with('-');
    let unsigned = mantissa.strip_prefix('-').unwrap_or(mantissa);
    let (integer, fraction) = unsigned.split_once('.').unwrap_or((unsigned, ""));
    let mut digits = format!("{integer}{fraction}");
    let significant = digits.trim_start_matches('0');
    if significant.is_empty() {
        return "0".to_owned();
    }
    let leading_zeroes = digits.len() - significant.len();
    digits.drain(..leading_zeroes);
    let trailing_zeroes = digits.len() - digits.trim_end_matches('0').len();
    digits.truncate(digits.len() - trailing_zeroes);
    let power = exponent - fraction.len() as i64 + trailing_zeroes as i64;
    format!("{}{}e{power}", if negative { "-" } else { "" }, digits)
}

#[test]
fn exact_json_comparison_normalizes_numeric_formatting_without_tolerance() {
    assert_exact_json(&json!(0), &json!(0.0), "zero");
    assert_exact_json(&json!(12), &json!(12.0), "integer-valued float");
    assert_exact_json(&json!(1200), &json!(1.2e3), "exponent notation");

    assert!(compare_exact_json(&json!(0), &json!(0.0000000001), "tiny difference").is_err());
    assert!(compare_exact_json(
        &json!(9_007_199_254_740_992_u64),
        &json!(9_007_199_254_740_993_u64),
        "adjacent large integers",
    )
    .is_err());
}

#[test]
fn exact_json_comparison_preserves_fields_and_array_order() {
    assert!(compare_exact_json(&json!({"a": 1}), &json!({"b": 1}), "field set").is_err());
    assert!(compare_exact_json(&json!([1, 2]), &json!([2, 1]), "array order").is_err());
}
