use riose_core::{
    run_native_scenario, EngineMetadata, NativeRunResult, NativeScenarioRequest,
    ADG_KG_PER_DAY_RANGE, BODY_WEIGHT_KG_RANGE, CONFIGURED_COMPARISON_REQUEST_VERSION,
    NATIVE_SCENARIO_VERSION, SUPPLEMENT_KG_DM_PER_DAY_RANGE,
};
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::BTreeMap;
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

const RESULT_PROTOCOL_VERSION: u16 = 1;

#[derive(Debug)]
struct CliError {
    exit_code: u8,
    code: &'static str,
    field: Option<String>,
    message: &'static str,
}

impl CliError {
    fn new(exit_code: u8, code: &'static str, message: &'static str) -> Self {
        Self {
            exit_code,
            code,
            field: None,
            message,
        }
    }

    fn at(
        exit_code: u8,
        code: &'static str,
        field: impl Into<String>,
        message: &'static str,
    ) -> Self {
        Self {
            exit_code,
            code,
            field: Some(field.into()),
            message,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorRecord<'a> {
    #[serde(rename = "type")]
    record_type: &'static str,
    version: u16,
    status: &'static str,
    code: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    field: &'a Option<String>,
    message: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SuccessRecord<'a> {
    #[serde(rename = "type")]
    record_type: &'static str,
    version: u16,
    request_version: u16,
    scenario: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<u32>,
    status: &'static str,
    run_id: String,
    input_sha256: String,
    native_result: &'a NativeRunResult,
}

struct Arguments {
    input: Option<PathBuf>,
    output: Option<PathBuf>,
}

enum ArgResult {
    Execute(Arguments),
    Help,
    Version,
}

enum UniqueValue {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<UniqueValue>),
    Object(BTreeMap<String, UniqueValue>),
}

// `serde_json::Value` accepts duplicate keys and keeps the final value. This
// visitor rejects duplicates at every object boundary before typed decoding.
impl<'de> Deserialize<'de> for UniqueValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct UniqueVisitor;

        impl<'de> Visitor<'de> for UniqueVisitor {
            type Value = UniqueValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a JSON value without duplicate object keys")
            }

            fn visit_unit<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::Null)
            }

            fn visit_none<E>(self) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::Null)
            }

            fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::Bool(value))
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::Number(Number::from(value)))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::Number(Number::from(value)))
            }

            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if !value.is_finite() {
                    return Err(E::custom("non-finite JSON number"));
                }
                Ok(UniqueValue::Number(
                    Number::from_f64(value).expect("finite JSON number"),
                ))
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::String(value.to_owned()))
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UniqueValue::String(value))
            }

            fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut values = Vec::new();
                while let Some(value) = sequence.next_element()? {
                    values.push(value);
                }
                Ok(UniqueValue::Array(values))
            }

            fn visit_map<A>(self, mut object: A) -> Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut values = BTreeMap::new();
                while let Some(key) = object.next_key::<String>()? {
                    if values.contains_key(&key) {
                        return Err(de::Error::custom("duplicate object key"));
                    }
                    values.insert(key, object.next_value()?);
                }
                Ok(UniqueValue::Object(values))
            }
        }

        deserializer.deserialize_any(UniqueVisitor)
    }
}

impl UniqueValue {
    fn into_value(self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Bool(value) => Value::Bool(value),
            Self::Number(value) => Value::Number(value),
            Self::String(value) => Value::String(value),
            Self::Array(values) => Value::Array(values.into_iter().map(Self::into_value).collect()),
            Self::Object(values) => Value::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, value.into_value()))
                    .collect(),
            ),
        }
    }
}

fn main() -> ExitCode {
    match execute() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let record = ErrorRecord {
                record_type: "riose-cli-error",
                version: RESULT_PROTOCOL_VERSION,
                status: "error",
                code: error.code,
                field: &error.field,
                message: error.message,
            };
            let mut bytes = serde_json::to_vec(&record).unwrap_or_else(|_| {
                br#"{"type":"riose-cli-error","version":1,"code":"INTERNAL_ERROR","message":"CLI failed to create an error record."}"#.to_vec()
            });
            bytes.push(b'\n');
            let _ = io::stderr().write_all(&bytes);
            ExitCode::from(error.exit_code)
        }
    }
}

fn execute() -> Result<(), CliError> {
    let arguments = match parse_arguments(std::env::args_os().skip(1))? {
        ArgResult::Execute(arguments) => arguments,
        ArgResult::Help => {
            io::stdout()
                .write_all(HELP.as_bytes())
                .map_err(|_| CliError::new(8, "OUTPUT_IO", "could not write CLI output."))?;
            return Ok(());
        }
        ArgResult::Version => {
            let version = format!("riose-run {}\n", env!("CARGO_PKG_VERSION"));
            io::stdout()
                .write_all(version.as_bytes())
                .map_err(|_| CliError::new(8, "OUTPUT_IO", "could not write CLI output."))?;
            return Ok(());
        }
    };

    if let (Some(input), Some(output)) = (arguments.input.as_deref(), arguments.output.as_deref()) {
        if input != Path::new("-") && output != Path::new("-") && paths_alias(input, output)? {
            return Err(CliError::new(
                2,
                "USAGE_ERROR",
                "input and output paths must not refer to the same file.",
            ));
        }
    }

    let input_bytes = read_input(arguments.input.as_deref())?;
    let json_value = parse_json(&input_bytes)?;
    let request = validate_and_decode(&json_value)?;
    let (scenario, seed) = request_identity(&request);
    let request_version = request_version(&request);

    let native_result =
        run_native_scenario(request).map_err(|error| classify_native_error(error, scenario))?;
    let native_json = serde_json::to_value(&native_result).map_err(|_| {
        CliError::new(
            7,
            "RESULT_SERIALIZATION",
            "native result could not be serialized.",
        )
    })?;
    if contains_null_or_non_finite(&native_json) {
        return Err(CliError::new(
            7,
            "RESULT_SERIALIZATION",
            "native result contains a non-finite value.",
        ));
    }

    let input_sha256 = format!("sha256:{}", hex_digest(&input_bytes));
    let run_id = create_run_id(&input_sha256, &native_result.engine);
    let record = SuccessRecord {
        record_type: "riose-native-result",
        version: RESULT_PROTOCOL_VERSION,
        request_version,
        scenario,
        seed,
        status: "success",
        run_id,
        input_sha256,
        native_result: &native_result,
    };
    let mut output_bytes = serde_json::to_vec(&record).map_err(|_| {
        CliError::new(
            7,
            "RESULT_SERIALIZATION",
            "result record could not be serialized.",
        )
    })?;
    output_bytes.push(b'\n');

    match arguments.output.as_deref() {
        Some(path) if path != Path::new("-") => write_output_file(path, &output_bytes),
        _ => io::stdout()
            .write_all(&output_bytes)
            .map_err(|_| CliError::new(8, "OUTPUT_IO", "could not write result output.")),
    }
}

const HELP: &str = "riose-run: run one versioned native scenario\n\nUsage: riose-run [--input PATH] [--output PATH]\n\
  --input PATH   Read JSON from PATH; '-' reads stdin. Omit to read stdin.\n\
  --output PATH  Write JSON to PATH; '-' or omission writes stdout.\n\
  --help         Show this help.\n\
  --version      Show the CLI version.\n";

fn parse_arguments<I>(arguments: I) -> Result<ArgResult, CliError>
where
    I: IntoIterator<Item = OsString>,
{
    let mut input = None;
    let mut output = None;
    let mut items = arguments.into_iter();
    let all: Vec<OsString> = items.by_ref().collect();
    if all.len() == 1 && all[0] == "--help" {
        return Ok(ArgResult::Help);
    }
    if all.len() == 1 && all[0] == "--version" {
        return Ok(ArgResult::Version);
    }

    let mut index = 0;
    while index < all.len() {
        let flag = all[index].to_str().ok_or_else(usage_error)?;
        index += 1;
        let slot = match flag {
            "--input" => &mut input,
            "--output" => &mut output,
            _ => return Err(usage_error()),
        };
        if slot.is_some() || index >= all.len() {
            return Err(usage_error());
        }
        *slot = Some(PathBuf::from(&all[index]));
        index += 1;
    }
    Ok(ArgResult::Execute(Arguments { input, output }))
}

fn usage_error() -> CliError {
    CliError::new(2, "USAGE_ERROR", "invalid command-line arguments.")
}

fn read_input(path: Option<&Path>) -> Result<Vec<u8>, CliError> {
    match path {
        Some(path) if path != Path::new("-") => {
            fs::read(path).map_err(|_| CliError::new(3, "INPUT_IO", "could not read input."))
        }
        _ => {
            let mut bytes = Vec::new();
            io::stdin()
                .read_to_end(&mut bytes)
                .map_err(|_| CliError::new(3, "INPUT_IO", "could not read input."))?;
            Ok(bytes)
        }
    }
}

fn parse_json(bytes: &[u8]) -> Result<Value, CliError> {
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let value = UniqueValue::deserialize(&mut deserializer)
        .map_err(|_| CliError::new(4, "INVALID_JSON", "input is not valid duplicate-free JSON."))?;
    deserializer
        .end()
        .map_err(|_| CliError::new(4, "INVALID_JSON", "input is not valid duplicate-free JSON."))?;
    Ok(value.into_value())
}

fn validate_and_decode(value: &Value) -> Result<NativeScenarioRequest, CliError> {
    let root = object_at(value, "")?;
    let scenario = required_string(root, "type", "")?;
    let version = required_u64(root, "version", "")?;
    let supported_version = match scenario {
        "baseline" | "housing-comparison" | "br-corte-pasture-dmi" => NATIVE_SCENARIO_VERSION,
        "configured-comparison" => CONFIGURED_COMPARISON_REQUEST_VERSION,
        _ => {
            return Err(CliError::at(
                6,
                "UNSUPPORTED_SCENARIO",
                "/type",
                "scenario type is not supported.",
            ))
        }
    };
    if version != u64::from(supported_version) {
        return Err(CliError::at(
            6,
            "UNSUPPORTED_VERSION",
            "/version",
            "request version is not supported.",
        ));
    }
    let expected_fields: &[&str] = match scenario {
        "baseline" => &[
            "type",
            "version",
            "seed",
            "animalCount",
            "configuration",
            "hours",
        ],
        "housing-comparison" => &["type", "version", "snapshot", "days"],
        "br-corte-pasture-dmi" => &[
            "type",
            "version",
            "bodyWeightKg",
            "adgKgPerDay",
            "supplementKgDMPerDay",
        ],
        "configured-comparison" => &[
            "type",
            "version",
            "snapshot",
            "days",
            "referenceConfig",
            "scenarioConfig",
        ],
        _ => unreachable!("scenario type was prevalidated"),
    };

    match scenario {
        "baseline" => validate_baseline_fields(root)?,
        "housing-comparison" => validate_housing_fields(root)?,
        "br-corte-pasture-dmi" => validate_br_corte_fields(root)?,
        "configured-comparison" => validate_configured_comparison_fields(root)?,
        _ => unreachable!(),
    }
    reject_unknown_fields(root, expected_fields, "")?;

    let request: NativeScenarioRequest = serde_json::from_value(value.clone()).map_err(|_| {
        CliError::at(
            5,
            "INVALID_REQUEST",
            match scenario {
                "baseline" => "/configuration",
                "housing-comparison" => "/snapshot",
                "br-corte-pasture-dmi" => "/bodyWeightKg",
                _ => "/snapshot",
            },
            "request fields do not match the supported scenario schema.",
        )
    })?;
    Ok(request)
}

fn validate_baseline_fields(root: &Map<String, Value>) -> Result<(), CliError> {
    let seed = required_u64(root, "seed", "")?;
    if seed > u64::from(u32::MAX) {
        return Err(CliError::at(
            5,
            "INVALID_REQUEST",
            "/seed",
            "seed must be an unsigned 32-bit integer.",
        ));
    }
    let animal_count = required_u64(root, "animalCount", "")?;
    if !(1..=10_000).contains(&animal_count) {
        return Err(CliError::at(
            5,
            "VALIDATION_ERROR",
            "/animalCount",
            "animalCount must be between 1 and 10000.",
        ));
    }
    let hours = required_u64(root, "hours", "")?;
    if !(1..=8_760).contains(&hours) {
        return Err(CliError::at(
            5,
            "VALIDATION_ERROR",
            "/hours",
            "hours must be between 1 and 8760.",
        ));
    }
    let configuration = required(root, "configuration", "")?;
    validate_config(configuration, "/configuration")?;
    Ok(())
}

fn validate_housing_fields(root: &Map<String, Value>) -> Result<(), CliError> {
    let days = required_u64(root, "days", "")?;
    if !(1..=365).contains(&days) {
        return Err(CliError::at(
            5,
            "VALIDATION_ERROR",
            "/days",
            "days must be between 1 and 365.",
        ));
    }
    let snapshot = required(root, "snapshot", "")?;
    validate_snapshot_unknown_fields(snapshot, "/snapshot")?;
    let snapshot = object_at(snapshot, "/snapshot")?;
    let snapshot_config = required(snapshot, "config", "/snapshot")?;
    let snapshot_config_object = object_at(snapshot_config, "/snapshot/config")?;
    require_fields(
        snapshot_config_object,
        &["diet", "housing", "weather", "supplement"],
        "/snapshot/config",
    )?;
    Ok(())
}

fn validate_br_corte_fields(root: &Map<String, Value>) -> Result<(), CliError> {
    for (field, range) in [
        ("bodyWeightKg", BODY_WEIGHT_KG_RANGE),
        ("adgKgPerDay", ADG_KG_PER_DAY_RANGE),
        ("supplementKgDMPerDay", SUPPLEMENT_KG_DM_PER_DAY_RANGE),
    ] {
        let value = required(root, field, "")?.as_f64().ok_or_else(|| {
            CliError::at(
                5,
                "INVALID_REQUEST",
                pointer("", field),
                "field must be a finite number.",
            )
        })?;
        if !value.is_finite() || value < range[0] || value > range[1] {
            return Err(CliError::at(
                5,
                "VALIDATION_ERROR",
                pointer("", field),
                match field {
                    "bodyWeightKg" => "bodyWeightKg must be between 133 and 474 kg for BR-CORTE Eq. 2.6.",
                    "adgKgPerDay" => "adgKgPerDay must be between -0.18 and 1.34 kg/day for BR-CORTE Eq. 2.6.",
                    _ => "supplementKgDMPerDay must be between 0 and 5.32 kg DM/day for BR-CORTE Eq. 2.6.",
                },
            ));
        }
    }
    Ok(())
}

fn validate_configured_comparison_fields(root: &Map<String, Value>) -> Result<(), CliError> {
    let days = required_u64(root, "days", "")?;
    if !(1..=365).contains(&days) {
        return Err(CliError::at(
            5,
            "VALIDATION_ERROR",
            "/days",
            "days must be between 1 and 365.",
        ));
    }
    let snapshot = required(root, "snapshot", "")?;
    validate_snapshot_unknown_fields(snapshot, "/snapshot")?;
    for name in ["referenceConfig", "scenarioConfig"] {
        let path = pointer("", name);
        let value = required(root, name, "")?;
        let config = object_at(value, &path)?;
        require_fields(config, &["diet", "housing", "weather", "supplement"], &path)?;
        validate_config(value, &path)?;
    }

    let reference = object_at(required(root, "referenceConfig", "")?, "/referenceConfig")?;
    let scenario = object_at(required(root, "scenarioConfig", "")?, "/scenarioConfig")?;
    let changed = ["diet", "housing", "weather", "supplement"]
        .iter()
        .filter(|field| {
            let field = **field;
            match field {
                "supplement" => reference[field].as_f64() != scenario[field].as_f64(),
                _ => reference[field] != scenario[field],
            }
        })
        .count();
    if changed != 1 {
        return Err(CliError::at(
            5,
            "VALIDATION_ERROR",
            "/scenarioConfig",
            "referenceConfig and scenarioConfig must differ in exactly one supported factor.",
        ));
    }
    Ok(())
}

fn validate_config(value: &Value, path: &str) -> Result<(), CliError> {
    let config = object_at(value, path)?;
    for (name, choices) in [
        ("diet", &["pasture", "balanced", "concentrate"][..]),
        ("housing", &["pasture", "barn"][..]),
        ("weather", &["normal", "hot", "rain"][..]),
    ] {
        if let Some(value) = config.get(name) {
            match value.as_str() {
                Some(value) if choices.contains(&value) => {}
                Some(_) => {
                    return Err(CliError::at(
                        6,
                        "UNSUPPORTED_SCENARIO",
                        pointer(path, name),
                        "configuration value is not supported by the native core.",
                    ))
                }
                None => {
                    return Err(CliError::at(
                        5,
                        "INVALID_REQUEST",
                        pointer(path, name),
                        "configuration value has the wrong type.",
                    ))
                }
            }
        }
    }
    if let Some(supplement) = config.get("supplement") {
        let value = supplement.as_f64().ok_or_else(|| {
            CliError::at(
                5,
                "INVALID_REQUEST",
                pointer(path, "supplement"),
                "supplement must be a finite number from 0 through 4.",
            )
        })?;
        if !(0.0..=4.0).contains(&value) {
            return Err(CliError::at(
                5,
                "VALIDATION_ERROR",
                pointer(path, "supplement"),
                "supplement must be between 0 and 4 kg DM per animal per day.",
            ));
        }
    }
    reject_unknown_fields(config, &["diet", "housing", "weather", "supplement"], path)?;
    Ok(())
}

fn validate_snapshot_unknown_fields(value: &Value, path: &str) -> Result<(), CliError> {
    let snapshot = object_at(value, path)?;
    require_fields(
        snapshot,
        &[
            "hour", "animals", "pastures", "intake", "config", "cost", "events", "seed",
        ],
        path,
    )?;
    if let Some(config) = snapshot.get("config") {
        validate_config(config, &pointer(path, "config"))?;
    }
    reject_unknown_fields(
        snapshot,
        &[
            "hour",
            "animals",
            "pastures",
            "intake",
            "config",
            "cost",
            "events",
            "seed",
            "initialSeed",
            "locomotionSeed",
        ],
        path,
    )?;
    if let Some(intake) = snapshot.get("intake") {
        let intake = object_at(intake, &pointer(path, "intake"))?;
        require_fields(
            intake,
            &[
                "pastureKgDM",
                "barnBaseKgDM",
                "supplementKgDM",
                "dietExtraKgDM",
            ],
            &pointer(path, "intake"),
        )?;
        reject_unknown_fields(
            intake,
            &[
                "pastureKgDM",
                "barnBaseKgDM",
                "supplementKgDM",
                "dietExtraKgDM",
            ],
            &pointer(path, "intake"),
        )?;
    }
    if let Some(animals) = snapshot.get("animals").and_then(Value::as_array) {
        for (index, animal) in animals.iter().enumerate() {
            let animal_path = format!("{}/animals/{index}", path);
            let animal = object_at(animal, &animal_path)?;
            require_fields(
                animal,
                &[
                    "id",
                    "name",
                    "weight",
                    "initialWeight",
                    "energy",
                    "thirst",
                    "action",
                    "patch",
                ],
                &animal_path,
            )?;
            reject_unknown_fields(
                animal,
                &[
                    "id",
                    "name",
                    "weight",
                    "initialWeight",
                    "energy",
                    "thirst",
                    "action",
                    "patch",
                    "x",
                    "y",
                    "targetX",
                    "targetY",
                    "history",
                ],
                &animal_path,
            )?;
            validate_enum_value(
                animal,
                "action",
                &animal_path,
                &["grazing", "feeding", "drinking", "resting"],
            )?;
            if let Some(history) = animal.get("history").and_then(Value::as_array) {
                for (history_index, record) in history.iter().enumerate() {
                    let record_path = format!("{animal_path}/history/{history_index}");
                    let record = object_at(record, &record_path)?;
                    require_fields(
                        record,
                        &["hour", "action", "reason", "observed"],
                        &record_path,
                    )?;
                    reject_unknown_fields(
                        record,
                        &["hour", "action", "reason", "observed"],
                        &record_path,
                    )?;
                    validate_enum_value(
                        record,
                        "action",
                        &record_path,
                        &["grazing", "feeding", "drinking", "resting"],
                    )?;
                    validate_enum_value(
                        record,
                        "reason",
                        &record_path,
                        &[
                            "pasture_housing",
                            "barn_housing",
                            "thirst_threshold",
                            "rest_window",
                        ],
                    )?;
                    if let Some(observed) = record.get("observed") {
                        let observed_path = pointer(&record_path, "observed");
                        let observed = object_at(observed, &observed_path)?;
                        require_fields(observed, &["hour", "thirst", "housing"], &observed_path)?;
                        reject_unknown_fields(
                            observed,
                            &["hour", "thirst", "housing"],
                            &observed_path,
                        )?;
                        validate_enum_value(
                            observed,
                            "housing",
                            &observed_path,
                            &["pasture", "barn"],
                        )?;
                    }
                }
            }
        }
    }
    if let Some(events) = snapshot.get("events").and_then(Value::as_array) {
        for (index, event) in events.iter().enumerate() {
            let event_path = format!("{path}/events/{index}");
            let event = object_at(event, &event_path)?;
            require_fields(event, &["hour", "text"], &event_path)?;
            reject_unknown_fields(event, &["hour", "text", "animalId"], &event_path)?;
        }
    }
    Ok(())
}

fn validate_enum_value(
    object: &Map<String, Value>,
    field: &str,
    path: &str,
    choices: &[&str],
) -> Result<(), CliError> {
    let Some(value) = object.get(field) else {
        return Ok(());
    };
    match value.as_str() {
        Some(value) if choices.contains(&value) => Ok(()),
        Some(_) => Err(CliError::at(
            6,
            "UNSUPPORTED_SCENARIO",
            pointer(path, field),
            "enum value is not supported by the native core.",
        )),
        None => Err(CliError::at(
            5,
            "INVALID_REQUEST",
            pointer(path, field),
            "enum value has the wrong type.",
        )),
    }
}

fn object_at<'a>(value: &'a Value, path: &str) -> Result<&'a Map<String, Value>, CliError> {
    value.as_object().ok_or_else(|| {
        CliError::at(
            5,
            "INVALID_REQUEST",
            if path.is_empty() { "/" } else { path },
            "expected a JSON object.",
        )
    })
}

fn required<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    path: &str,
) -> Result<&'a Value, CliError> {
    object.get(field).ok_or_else(|| {
        CliError::at(
            5,
            "INVALID_REQUEST",
            pointer(path, field),
            "required field is missing.",
        )
    })
}

fn required_string<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    path: &str,
) -> Result<&'a str, CliError> {
    required(object, field, path)?.as_str().ok_or_else(|| {
        CliError::at(
            5,
            "INVALID_REQUEST",
            pointer(path, field),
            "field must be a string.",
        )
    })
}

fn required_u64(object: &Map<String, Value>, field: &str, path: &str) -> Result<u64, CliError> {
    required(object, field, path)?.as_u64().ok_or_else(|| {
        CliError::at(
            5,
            "INVALID_REQUEST",
            pointer(path, field),
            "field must be an unsigned integer.",
        )
    })
}

fn reject_unknown_fields(
    object: &Map<String, Value>,
    allowed: &[&str],
    path: &str,
) -> Result<(), CliError> {
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(CliError::at(
                6,
                "UNSUPPORTED_FIELD",
                pointer(path, key),
                "field is not supported by the native scenario contract.",
            ));
        }
    }
    Ok(())
}

fn require_fields(
    object: &Map<String, Value>,
    required_fields: &[&str],
    path: &str,
) -> Result<(), CliError> {
    for field in required_fields {
        if !object.contains_key(*field) {
            return Err(CliError::at(
                5,
                "INVALID_REQUEST",
                pointer(path, field),
                "required field is missing.",
            ));
        }
    }
    Ok(())
}

fn pointer(path: &str, field: &str) -> String {
    let escaped = field.replace('~', "~0").replace('/', "~1");
    if path.is_empty() {
        format!("/{escaped}")
    } else {
        format!("{path}/{escaped}")
    }
}

fn request_identity(request: &NativeScenarioRequest) -> (&'static str, Option<u32>) {
    match request {
        NativeScenarioRequest::Baseline { seed, .. } => ("baseline", Some(*seed)),
        NativeScenarioRequest::HousingComparison { snapshot, .. } => {
            ("housing-comparison", Some(snapshot.initial_seed))
        }
        NativeScenarioRequest::BrCortePastureDmi { .. } => ("br-corte-pasture-dmi", None),
        NativeScenarioRequest::ConfiguredComparison { snapshot, .. } => {
            ("configured-comparison", Some(snapshot.initial_seed))
        }
    }
}

fn request_version(request: &NativeScenarioRequest) -> u16 {
    match request {
        NativeScenarioRequest::ConfiguredComparison { version, .. } => *version,
        _ => NATIVE_SCENARIO_VERSION,
    }
}

fn classify_native_error(error: String, scenario: &'static str) -> CliError {
    if error == "tick hours must be between 1 and 8760" {
        return CliError::at(
            5,
            "VALIDATION_ERROR",
            "/hours",
            "hours must be between 1 and 8760.",
        );
    }
    if scenario == "housing-comparison" || scenario == "configured-comparison" {
        return CliError::at(
            5,
            "VALIDATION_ERROR",
            "/snapshot",
            "snapshot does not meet native scenario requirements.",
        );
    }
    CliError::new(7, "NATIVE_EXECUTION", "native scenario execution failed.")
}

fn contains_null_or_non_finite(value: &Value) -> bool {
    match value {
        Value::Null => true,
        Value::Number(number) => number.as_f64().map_or(true, |value| !value.is_finite()),
        Value::Array(values) => values.iter().any(contains_null_or_non_finite),
        Value::Object(values) => values.values().any(contains_null_or_non_finite),
        _ => false,
    }
}

fn hex_digest(bytes: &[u8]) -> String {
    sha256(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn sha256(input: &[u8]) -> [u8; 32] {
    const ROUND: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut state = [
        0x6a09e667u32,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut padded = Vec::with_capacity((input.len() + 72) / 64 * 64);
    padded.extend_from_slice(input);
    let bit_length = (input.len() as u64).wrapping_mul(8);
    padded.push(0x80);
    while padded.len() % 64 != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_length.to_be_bytes());

    for chunk in padded.chunks_exact(64) {
        let mut words = [0u32; 64];
        for (index, word) in chunk.chunks_exact(4).take(16).enumerate() {
            words[index] = u32::from_be_bytes(word.try_into().expect("four-byte word"));
        }
        for index in 16..64 {
            let s0 = words[index - 15].rotate_right(7)
                ^ words[index - 15].rotate_right(18)
                ^ (words[index - 15] >> 3);
            let s1 = words[index - 2].rotate_right(17)
                ^ words[index - 2].rotate_right(19)
                ^ (words[index - 2] >> 10);
            words[index] = words[index - 16]
                .wrapping_add(s0)
                .wrapping_add(words[index - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
        for index in 0..64 {
            let sum1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(ROUND[index])
                .wrapping_add(words[index]);
            let sum0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = sum0.wrapping_add(majority);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        for (current, value) in state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *current = current.wrapping_add(value);
        }
    }

    let mut digest = [0u8; 32];
    for (chunk, value) in digest.chunks_exact_mut(4).zip(state) {
        chunk.copy_from_slice(&value.to_be_bytes());
    }
    digest
}

fn create_run_id(input_sha256: &str, engine: &EngineMetadata) -> String {
    let input_hex = input_sha256.strip_prefix("sha256:").unwrap_or(input_sha256);
    let identity = format!(
        "riose-run-id-v1\n{input_hex}\n{}\n{RESULT_PROTOCOL_VERSION}",
        engine.build_id
    );
    format!("sha256:{}", hex_digest(identity.as_bytes()))
}

fn paths_alias(input: &Path, output: &Path) -> Result<bool, CliError> {
    let input = fs::canonicalize(input)
        .map_err(|_| CliError::new(3, "INPUT_IO", "could not read input."))?;
    let output = resolved_output_path(output)
        .map_err(|_| CliError::new(8, "OUTPUT_IO", "could not prepare result output."))?;
    Ok(normalized_path(&input) == normalized_path(&output))
}

fn resolved_output_path(output: &Path) -> io::Result<PathBuf> {
    if output.exists() {
        return fs::canonicalize(output);
    }
    let parent = output
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let parent = fs::canonicalize(parent)?;
    let name = output
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "output has no file name"))?;
    Ok(parent.join(name))
}

fn normalized_path(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        value.to_lowercase()
    } else {
        value
    }
}

fn write_output_file(path: &Path, bytes: &[u8]) -> Result<(), CliError> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let file_name = path
        .file_name()
        .ok_or_else(|| CliError::new(8, "OUTPUT_IO", "could not prepare result output."))?;
    let mut temporary = None;
    for suffix in 0..100u32 {
        let mut name = OsString::from(".");
        name.push(file_name);
        name.push(format!(".riose-{}-{suffix}.tmp", std::process::id()));
        let candidate = parent.join(name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => {
                temporary = Some((candidate, file));
                break;
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => break,
        }
    }
    let (temporary_path, mut file): (PathBuf, File) = temporary
        .ok_or_else(|| CliError::new(8, "OUTPUT_IO", "could not create result output."))?;
    let write_result = file.write_all(bytes).and_then(|_| file.sync_all());
    drop(file);
    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
        return Err(CliError::new(
            8,
            "OUTPUT_IO",
            "could not write result output.",
        ));
    }
    if replace_file(&temporary_path, path).is_err() {
        let _ = fs::remove_file(&temporary_path);
        return Err(CliError::new(
            8,
            "OUTPUT_IO",
            "could not commit result output.",
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both pointers refer to live, null-terminated UTF-16 buffers.
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_native_error, hex_digest};

    #[test]
    fn sha256_matches_standard_vectors() {
        assert_eq!(
            hex_digest(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            hex_digest(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            hex_digest(&vec![b'a'; 1000]),
            "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3"
        );
    }

    #[test]
    fn unexpected_baseline_native_failure_keeps_its_execution_class() {
        let error = classify_native_error("unexpected native failure".to_owned(), "baseline");
        assert_eq!(error.exit_code, 7);
        assert_eq!(error.code, "NATIVE_EXECUTION");
        assert_eq!(error.field, None);
    }
}
