use serde_json::{json, Value};
use std::ffi::OsString;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

const BASELINE: &str = r#"{"type":"baseline","version":1,"seed":417,"animalCount":3,"configuration":{"diet":"pasture","housing":"pasture","weather":"normal","supplement":0},"hours":24}"#;
const HOUSING_GOLDEN: &str =
    include_str!("../../../tests/scenario-goldens/housing-comparison.json");

static NEXT_TEMP: AtomicUsize = AtomicUsize::new(0);

struct TestDirectory(PathBuf);

impl TestDirectory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "riose-native-cli-{}-{}",
            std::process::id(),
            NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run_cli(args: &[&str], input: Option<&[u8]>) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_riose-run"))
        .args(args.iter().map(OsString::from))
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(input) = input {
        child.stdin.take().unwrap().write_all(input).unwrap();
    }
    child.wait_with_output().unwrap()
}

fn error_record(output: &Output, exit_code: u8, code: &str, field: Option<&str>) {
    assert_eq!(output.status.code(), Some(i32::from(exit_code)));
    assert!(output.stdout.is_empty(), "stdout was {:?}", output.stdout);
    assert_eq!(output.stderr.last(), Some(&b'\n'));
    let value: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert_eq!(value["type"], "riose-cli-error");
    assert_eq!(value["version"], 1);
    assert_eq!(value["status"], "error");
    assert_eq!(value["code"], code);
    assert_eq!(value.get("field").and_then(Value::as_str), field);
}

fn baseline_value() -> Value {
    serde_json::from_str(BASELINE).unwrap()
}

fn assert_json_exact(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Number(actual), Value::Number(expected)) => {
            assert_eq!(canonical_number(actual), canonical_number(expected));
        }
        (Value::Object(actual), Value::Object(expected)) => {
            assert_eq!(actual.len(), expected.len());
            for (key, actual_value) in actual {
                assert_json_exact(actual_value, &expected[key]);
            }
        }
        (Value::Array(actual), Value::Array(expected)) => {
            assert_eq!(actual.len(), expected.len());
            for (actual_value, expected_value) in actual.iter().zip(expected) {
                assert_json_exact(actual_value, expected_value);
            }
        }
        _ => assert_eq!(actual, expected),
    }
}

fn canonical_number(number: &serde_json::Number) -> String {
    let source = number.to_string();
    let exponent_index = source.find(|character| character == 'e' || character == 'E');
    let (mantissa, exponent) = match exponent_index {
        Some(index) => (
            &source[..index],
            source[index + 1..].parse::<i64>().unwrap(),
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
fn baseline_matches_the_native_official_golden_and_has_a_stable_record() {
    let first = run_cli(&[], Some(BASELINE.as_bytes()));
    let second = run_cli(&["--input", "-"], Some(BASELINE.as_bytes()));
    assert_eq!(first.status.code(), Some(0));
    assert!(first.stderr.is_empty());
    assert_eq!(first.stdout, second.stdout);
    assert_eq!(first.stdout.last(), Some(&b'\n'));

    let record: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(record["type"], "riose-native-result");
    assert_eq!(record["version"], 1);
    assert_eq!(record["requestVersion"], 1);
    assert_eq!(record["scenario"], "baseline");
    assert_eq!(record["seed"], 417);
    assert_eq!(record["status"], "success");
    assert_eq!(
        record["inputSha256"],
        "sha256:c785f125b8f17af217cd58f1c5857e336aafd2c3001beb107ef36e24d4b9223b"
    );
    assert_eq!(
        record["nativeResult"]["engine"]["buildId"],
        option_env!("RIOSE_BUILD_ID").unwrap_or(concat!("riose-core@", env!("CARGO_PKG_VERSION")))
    );
    let serialized = std::str::from_utf8(&first.stdout).unwrap();
    let keys = [
        "\"type\"",
        "\"version\"",
        "\"requestVersion\"",
        "\"scenario\"",
        "\"seed\"",
        "\"status\"",
        "\"runId\"",
        "\"inputSha256\"",
        "\"nativeResult\"",
    ];
    let positions: Vec<usize> = keys
        .iter()
        .map(|key| serialized.find(key).unwrap())
        .collect();
    assert!(positions.windows(2).all(|pair| pair[0] < pair[1]));

    let golden: Value = serde_json::from_str(include_str!(
        "../../../tests/scenario-goldens/baseline-pasture.json"
    ))
    .unwrap();
    assert_json_exact(
        record["nativeResult"]["result"]["snapshot"],
        &golden["output"]["state"],
    );
    assert_json_exact(
        &record["nativeResult"]["result"]["metrics"],
        &golden["output"]["metrics"],
    );
}

#[test]
fn input_digest_tracks_exact_bytes_including_whitespace() {
    let compact = run_cli(&[], Some(BASELINE.as_bytes()));
    let spaced_input = format!("{BASELINE}\n");
    let spaced = run_cli(&[], Some(spaced_input.as_bytes()));
    assert_eq!(compact.status.code(), Some(0));
    assert_eq!(spaced.status.code(), Some(0));
    let compact: Value = serde_json::from_slice(&compact.stdout).unwrap();
    let spaced: Value = serde_json::from_slice(&spaced.stdout).unwrap();
    assert_ne!(compact["inputSha256"], spaced["inputSha256"]);
    assert_ne!(compact["runId"], spaced["runId"]);
    assert_eq!(
        compact["nativeResult"]["result"],
        spaced["nativeResult"]["result"]
    );
}

#[test]
fn housing_comparison_uses_native_api_and_emits_deterministic_record() {
    let golden: Value = serde_json::from_str(HOUSING_GOLDEN).unwrap();
    let snapshot = golden["replayManifest"]["baseline"].clone();
    let request = serde_json::to_vec(&json!({
        "type": "housing-comparison",
        "version": 1,
        "snapshot": snapshot,
        "days": 30
    }))
    .unwrap();
    let first = run_cli(&[], Some(&request));
    let second = run_cli(&[], Some(&request));
    assert_eq!(first.status.code(), Some(0));
    assert!(first.stderr.is_empty());
    assert_eq!(first.stdout, second.stdout);
    let record: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(record["scenario"], "housing-comparison");
    assert_eq!(record["seed"], 2026);
    assert!(record["nativeResult"]["result"]["comparison"].is_object());
    assert_json_exact(
        &record["nativeResult"]["result"]["comparison"],
        &golden["output"],
    );
}

#[test]
fn input_file_and_output_file_match_stdin_and_stdout_bytes() {
    let directory = TestDirectory::new();
    let input_path = directory.path().join("request.json");
    let output_path = directory.path().join("result.json");
    fs::write(&input_path, BASELINE).unwrap();
    fs::write(&output_path, b"stale output that must be replaced\n").unwrap();

    let stdout = run_cli(&["--input", input_path.to_str().unwrap()], None);
    let file = run_cli(
        &[
            "--input",
            input_path.to_str().unwrap(),
            "--output",
            output_path.to_str().unwrap(),
        ],
        None,
    );
    assert_eq!(stdout.status.code(), Some(0));
    assert_eq!(file.status.code(), Some(0));
    assert!(stdout.stderr.is_empty());
    assert!(file.stderr.is_empty());
    assert!(file.stdout.is_empty());
    assert_eq!(fs::read(output_path).unwrap(), stdout.stdout);
}

#[test]
fn input_output_alias_is_rejected_before_replacing_the_input() {
    let directory = TestDirectory::new();
    let input_path = directory.path().join("same.json");
    fs::write(&input_path, BASELINE).unwrap();
    let result = run_cli(
        &[
            "--input",
            input_path.to_str().unwrap(),
            "--output",
            input_path.to_str().unwrap(),
        ],
        None,
    );
    error_record(&result, 2, "USAGE_ERROR", None);
    assert_eq!(fs::read(input_path).unwrap(), BASELINE.as_bytes());
}

#[test]
fn invalid_json_and_duplicate_keys_are_classified_before_dispatch() {
    error_record(&run_cli(&[], Some(b"{")), 4, "INVALID_JSON", None);
    error_record(
        &run_cli(
            &[],
            Some(br#"{"type":"baseline","version":1,"configuration":{"weather":"normal","weather":"hot"}}"#),
        ),
        4,
        "INVALID_JSON",
        None,
    );
}

#[test]
fn unsupported_version_is_reported_before_payload_validation() {
    error_record(
        &run_cli(
            &[],
            Some(br#"{"type":"baseline","version":2,"futurePayload":true}"#),
        ),
        6,
        "UNSUPPORTED_VERSION",
        Some("/version"),
    );
}

#[test]
fn required_unknown_seed_and_unsupported_scenario_fail_with_stable_codes() {
    let mut missing = baseline_value();
    missing.as_object_mut().unwrap().remove("seed");
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&missing).unwrap())),
        5,
        "INVALID_REQUEST",
        Some("/seed"),
    );

    let mut unknown = baseline_value();
    unknown["unexpected"] = json!(true);
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&unknown).unwrap())),
        6,
        "UNSUPPORTED_FIELD",
        Some("/unexpected"),
    );

    let mut bad_seed = baseline_value();
    bad_seed["seed"] = json!("417");
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&bad_seed).unwrap())),
        5,
        "INVALID_REQUEST",
        Some("/seed"),
    );

    let mut oversized_seed = baseline_value();
    oversized_seed["seed"] = json!(u64::from(u32::MAX) + 1);
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&oversized_seed).unwrap())),
        5,
        "INVALID_REQUEST",
        Some("/seed"),
    );

    error_record(
        &run_cli(&[], Some(br#"{"type":"rainfall-projection","version":1}"#)),
        6,
        "UNSUPPORTED_SCENARIO",
        Some("/type"),
    );
}

#[test]
fn unsupported_fields_and_values_are_rejected_at_nested_boundaries() {
    let mut unknown = baseline_value();
    unknown["configuration"]["rainfallMm"] = json!(42);
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&unknown).unwrap())),
        6,
        "UNSUPPORTED_FIELD",
        Some("/configuration/rainfallMm"),
    );

    let mut unsupported = baseline_value();
    unsupported["configuration"]["weather"] = json!("heat-intervention");
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&unsupported).unwrap())),
        6,
        "UNSUPPORTED_SCENARIO",
        Some("/configuration/weather"),
    );

    let golden: Value = serde_json::from_str(HOUSING_GOLDEN).unwrap();
    let mut snapshot = golden["replayManifest"]["baseline"].clone();
    snapshot["unexpected"] = json!(42);
    let request = serde_json::to_vec(&json!({
        "type": "housing-comparison",
        "version": 1,
        "snapshot": snapshot,
        "days": 30
    }))
    .unwrap();
    error_record(
        &run_cli(&[], Some(&request)),
        6,
        "UNSUPPORTED_FIELD",
        Some("/snapshot/unexpected"),
    );
}

#[test]
fn invalid_snapshot_and_core_validation_error_use_validation_exit_code() {
    let golden: Value = serde_json::from_str(HOUSING_GOLDEN).unwrap();
    let mut snapshot = golden["replayManifest"]["baseline"].clone();
    snapshot["animals"] = json!([]);
    let request = serde_json::to_vec(&json!({
        "type": "housing-comparison",
        "version": 1,
        "snapshot": snapshot,
        "days": 30
    }))
    .unwrap();
    error_record(
        &run_cli(&[], Some(&request)),
        5,
        "VALIDATION_ERROR",
        Some("/snapshot"),
    );

    let mut bad_hours = baseline_value();
    bad_hours["hours"] = json!(8761);
    error_record(
        &run_cli(&[], Some(&serde_json::to_vec(&bad_hours).unwrap())),
        5,
        "VALIDATION_ERROR",
        Some("/hours"),
    );
}

#[test]
fn missing_input_and_unwritable_output_are_io_errors() {
    let directory = TestDirectory::new();
    let missing_input = directory.path().join("missing.json");
    error_record(
        &run_cli(&["--input", missing_input.to_str().unwrap()], None),
        3,
        "INPUT_IO",
        None,
    );

    let missing_parent_output = directory.path().join("missing-parent").join("result.json");
    error_record(
        &run_cli(
            &[
                "--input",
                "-",
                "--output",
                missing_parent_output.to_str().unwrap(),
            ],
            Some(BASELINE.as_bytes()),
        ),
        8,
        "OUTPUT_IO",
        None,
    );
}

#[test]
fn command_line_errors_do_not_start_scenario_execution() {
    error_record(&run_cli(&["--unknown"], None), 2, "USAGE_ERROR", None);
    error_record(
        &run_cli(&["--input", "-", "--input", "-"], Some(BASELINE.as_bytes())),
        2,
        "USAGE_ERROR",
        None,
    );
}
