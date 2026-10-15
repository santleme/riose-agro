use riose_core::{
    run_native_scenario, FarmConfig, FarmEngine, FarmSnapshot, NativeScenarioRequest,
    NativeScenarioResult,
};
use serde_json::{json, Value};

const BASELINE_GOLDEN: &str = include_str!("../../../tests/scenario-goldens/baseline-pasture.json");
const HOUSING_GOLDEN: &str =
    include_str!("../../../tests/scenario-goldens/housing-comparison.json");
const PARITY_TOLERANCES: &str =
    include_str!("../../../tests/scenario-goldens/parity-tolerances-v1.json");

#[derive(Default)]
struct ParityCursor {
    events: Vec<Value>,
    histories: std::collections::HashMap<String, Vec<Value>>,
}

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
    assert_native_provenance(&first.engine);
    assert_exact_json(
        &serde_json::to_value(&snapshot).unwrap(),
        &golden["output"]["state"],
        "baseline state",
    );
    assert_exact_json(
        &serde_json::to_value(metrics).unwrap(),
        &golden["output"]["metrics"],
        "baseline metrics",
    );
    let mut engine =
        FarmEngine::new(417, golden["animalCount"].as_u64().unwrap() as usize).unwrap();
    engine
        .configure(serde_json::from_value(golden["configuration"].clone()).unwrap())
        .unwrap();
    let mut cursor = ParityCursor::default();
    let mut trajectory = Vec::new();
    let baseline_days = golden["horizon"]["value"].as_u64().unwrap().div_ceil(24);
    for day in 1..=baseline_days {
        engine.tick(24).unwrap();
        let mut row = parity_state(&engine, &mut cursor);
        row["day"] = json!(day);
        trajectory.push(row);
    }
    assert_tolerant_json(
        &Value::Array(trajectory),
        &golden["trajectory"],
        "baseline daily trajectory",
    );
    assert!(snapshot.hour == golden["output"]["state"]["hour"]);
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
    assert_native_provenance(&first.engine);

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

    let configs = [
        serde_json::from_value::<riose_core::FarmConfig>(
            manifest["inputs"]["baseline_config"].clone(),
        )
        .unwrap(),
        serde_json::from_value::<riose_core::FarmConfig>(
            manifest["inputs"]["scenario_config"].clone(),
        )
        .unwrap(),
    ];
    let mut engines = [
        FarmEngine::from_snapshot(snapshot.clone()).unwrap(),
        FarmEngine::from_snapshot(snapshot.clone()).unwrap(),
    ];
    engines[0].configure(configs[0].clone()).unwrap();
    engines[1].configure(configs[1].clone()).unwrap();
    let mut cursors = [ParityCursor::default(), ParityCursor::default()];
    let mut trajectory = vec![json!({
        "day": 0,
        "baseline": parity_state(&engines[0], &mut cursors[0]),
        "scenario": parity_state(&engines[1], &mut cursors[1]),
    })];
    for day in 1..=golden["horizon"]["value"].as_u64().unwrap() {
        engines[0].tick(24).unwrap();
        engines[1].tick(24).unwrap();
        trajectory.push(json!({
            "day": day,
            "baseline": parity_state(&engines[0], &mut cursors[0]),
            "scenario": parity_state(&engines[1], &mut cursors[1]),
        }));
    }
    assert_tolerant_json(
        &Value::Array(trajectory),
        &golden["trajectory"],
        "housing daily trajectory",
    );
}

fn assert_native_provenance(engine: &riose_core::EngineMetadata) {
    assert_eq!(engine.engine_version, env!("CARGO_PKG_VERSION"));
    assert_eq!(
        engine.build_id,
        option_env!("RIOSE_BUILD_ID").unwrap_or(concat!("riose-core@", env!("CARGO_PKG_VERSION")))
    );
    assert_eq!(engine.model_status, "demonstrative_unvalidated");
    assert_eq!(engine.provenance, "native-rust-core");
    assert!(!engine.validated);
}

fn parity_state(engine: &FarmEngine, cursor: &mut ParityCursor) -> Value {
    let mut snapshot = serde_json::to_value(engine.snapshot()).unwrap();
    let current_events = snapshot["events"].as_array().unwrap().clone();
    let event_delta = prepended_records(&cursor.events, &current_events);
    cursor.events = current_events;
    let animals = snapshot["animals"].as_array_mut().unwrap();
    let mut history_deltas = serde_json::Map::new();
    for animal in animals {
        let id = animal["id"].to_string();
        let history = animal["history"].as_array().unwrap().clone();
        let previous = cursor.histories.get(&id).cloned().unwrap_or_default();
        history_deltas.insert(
            id.clone(),
            Value::Array(appended_records(&previous, &history)),
        );
        cursor.histories.insert(id, history);
        animal.as_object_mut().unwrap().remove("history");
    }
    snapshot.as_object_mut().unwrap().remove("events");
    json!({
        "snapshot": snapshot,
        "metrics": serde_json::to_value(engine.metrics()).unwrap(),
        "eventDelta": event_delta,
        "historyDeltas": history_deltas,
    })
}

fn appended_records(previous: &[Value], current: &[Value]) -> Vec<Value> {
    for overlap in (1..=previous.len().min(current.len())).rev() {
        if previous[previous.len() - overlap..] == current[..overlap] {
            return current[overlap..].to_vec();
        }
    }
    current.to_vec()
}

fn prepended_records(previous: &[Value], current: &[Value]) -> Vec<Value> {
    for overlap in (1..=previous.len().min(current.len())).rev() {
        if previous[..overlap] == current[current.len() - overlap..] {
            return current[..current.len() - overlap].to_vec();
        }
    }
    current.to_vec()
}

#[test]
fn native_gain_metric_preserves_javascript_left_to_right_accumulation_order() {
    let mut engine = FarmEngine::new(2026, 24).expect("official housing seed must initialize");
    engine.configure(FarmConfig::default()).unwrap();
    engine.tick(219).unwrap();

    let snapshot = engine.snapshot();
    let js_ordered_gain = snapshot.animals.iter().fold(0.0, |sum, animal| {
        sum + animal.weight - animal.initial_weight
    }) / snapshot.animals.len() as f64;
    assert_eq!(snapshot.hour, 225);
    assert_eq!(engine.metrics().gain, js_ordered_gain);
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

fn assert_tolerant_json(actual: &Value, expected: &Value, path: &str) {
    let tolerances: Value = serde_json::from_str(PARITY_TOLERANCES)
        .expect("parity tolerance policy must be valid JSON");
    assert_eq!(tolerances["format"], "riose-cross-engine-parity-tolerances");
    assert_eq!(tolerances["version"], 1);
    assert_eq!(tolerances["default"], "exact");
    compare_tolerant_json(actual, expected, &mut Vec::new(), &tolerances, path)
        .unwrap_or_else(|error| panic!("{error}"));
}

fn compare_tolerant_json(
    actual: &Value,
    expected: &Value,
    path_parts: &mut Vec<String>,
    tolerances: &Value,
    display_path: &str,
) -> Result<(), String> {
    match (actual, expected) {
        (Value::Number(actual), Value::Number(expected)) => {
            let tolerance_key = match path_parts.as_slice() {
                [.., parent, index] if index.parse::<usize>().is_ok() => format!("{parent}/*"),
                [.., field] => field.clone(),
                _ => String::new(),
            };
            if let Some(rule) = tolerances["floatingFields"].get(&tolerance_key) {
                let actual = actual.as_f64().ok_or_else(|| {
                    format!("{display_path}: non-finite or non-f64 actual number")
                })?;
                let expected = expected.as_f64().ok_or_else(|| {
                    format!("{display_path}: non-finite or non-f64 expected number")
                })?;
                let absolute = rule["absolute"].as_f64().unwrap();
                let relative = rule["relative"].as_f64().unwrap();
                let allowed = absolute + relative * expected.abs();
                if (actual - expected).abs() <= allowed {
                    Ok(())
                } else {
                    Err(format!("{display_path}: numeric values differ ({actual} vs {expected}; tolerance {allowed})"))
                }
            } else if canonical_number(actual) == canonical_number(expected) {
                Ok(())
            } else {
                Err(format!(
                    "{display_path}: exact numeric values differ ({actual} vs {expected})"
                ))
            }
        }
        (Value::Object(actual), Value::Object(expected)) => {
            let ignored_visual = ["locomotionSeed", "x", "y", "targetX", "targetY"];
            let actual: std::collections::BTreeMap<_, _> = actual
                .iter()
                .filter(|(key, _)| !ignored_visual.contains(&key.as_str()))
                .collect();
            let expected: std::collections::BTreeMap<_, _> = expected
                .iter()
                .filter(|(key, _)| !ignored_visual.contains(&key.as_str()))
                .collect();
            if actual.len() != expected.len() {
                return Err(format!("{display_path}: object field count differs"));
            }
            for (key, actual_value) in actual {
                let expected_value = expected
                    .get(key)
                    .ok_or_else(|| format!("{display_path}.{key}: unexpected field"))?;
                path_parts.push(key.clone());
                let result = compare_tolerant_json(
                    actual_value,
                    expected_value,
                    path_parts,
                    tolerances,
                    &format!("{display_path}.{key}"),
                );
                path_parts.pop();
                result?;
            }
            Ok(())
        }
        (Value::Array(actual), Value::Array(expected)) => {
            if actual.len() != expected.len() {
                return Err(format!(
                    "{display_path}: array lengths differ ({} vs {})",
                    actual.len(),
                    expected.len()
                ));
            }
            for (index, (actual, expected)) in actual.iter().zip(expected).enumerate() {
                path_parts.push(index.to_string());
                let result = compare_tolerant_json(
                    actual,
                    expected,
                    path_parts,
                    tolerances,
                    &format!("{display_path}[{index}]"),
                );
                path_parts.pop();
                result?;
            }
            Ok(())
        }
        _ if actual == expected => Ok(()),
        _ => Err(format!(
            "{display_path}: values differ ({actual} vs {expected})"
        )),
    }
}

fn compare_exact_json(actual: &Value, expected: &Value, path: &str) -> Result<(), String> {
    match (actual, expected) {
        (Value::Number(actual), Value::Number(expected)) => {
            let actual = canonical_number(actual);
            let expected = canonical_number(expected);
            if actual == expected {
                Ok(())
            } else {
                Err(format!(
                    "{path}: numeric values differ ({actual} vs {expected})"
                ))
            }
        }
        (Value::Object(actual), Value::Object(expected)) => {
            let ignored_visual = ["locomotionSeed", "x", "y", "targetX", "targetY"];
            let actual: std::collections::BTreeMap<_, _> = actual
                .iter()
                .filter(|(key, _)| !ignored_visual.contains(&key.as_str()))
                .collect();
            let expected: std::collections::BTreeMap<_, _> = expected
                .iter()
                .filter(|(key, _)| !ignored_visual.contains(&key.as_str()))
                .collect();
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

#[test]
fn parity_tolerance_policy_is_field_specific_and_keeps_ordered_fields_exact() {
    assert_tolerant_json(
        &json!({"weight": 350.00000000001, "pastures": [12.00000000001]}),
        &json!({"weight": 350.0, "pastures": [12.0]}),
        "tolerated floating fields",
    );
    assert!(compare_tolerant_json(
        &json!({"id": 1.0000000001}),
        &json!({"id": 1}),
        &mut Vec::new(),
        &serde_json::from_str(PARITY_TOLERANCES).unwrap(),
        "exact ID",
    )
    .is_err());
    assert!(compare_tolerant_json(
        &json!({"historyDeltas": {"1": ["first", "second"]}}),
        &json!({"historyDeltas": {"1": ["second", "first"]}}),
        &mut Vec::new(),
        &serde_json::from_str(PARITY_TOLERANCES).unwrap(),
        "history order",
    )
    .is_err());
}
