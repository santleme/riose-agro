use riose_core::{run_native_scenario, NativeRunResult, NativeScenarioRequest};
use serde_json::{json, Value};
use std::hint::black_box;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const WARMUP_RUNS: usize = 3;
const MEASURED_RUNS: usize = 20;
const MINIMAL_REQUEST: &[u8] =
    br#"{"type":"baseline","version":1,"seed":1,"animalCount":1,"configuration":{},"hours":1}"#;
const BASELINE_SCENARIO: &str = include_str!("../../../tests/scenarios/baseline-pasture.json");
const HOUSING_GOLDEN: &str =
    include_str!("../../../tests/scenario-goldens/housing-comparison.json");

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let baseline_fixture: Value = serde_json::from_str(BASELINE_SCENARIO)?;
    let baseline: NativeScenarioRequest = serde_json::from_value(json!({
        "type": "baseline",
        "version": 1,
        "seed": baseline_fixture["engine"]["seed"],
        "animalCount": baseline_fixture["engine"]["animalCount"],
        "configuration": baseline_fixture["configuration"].clone(),
        "hours": baseline_fixture["run"]["hours"]
    }))?;
    let golden: Value = serde_json::from_str(HOUSING_GOLDEN)?;
    let housing: NativeScenarioRequest = serde_json::from_value(json!({
        "type": "housing-comparison",
        "version": 1,
        "snapshot": golden["replayManifest"]["baseline"].clone(),
        "days": 30
    }))?;

    let engine = run_native_scenario(baseline.clone())?.engine;
    let binary = cli_binary_path()?;
    let startup = measure_startup(&binary)?;
    let baseline_runtime = measure_scenario(baseline)?;
    let housing_runtime = measure_scenario(housing)?;

    println!("measurement=riose-native-cli");
    println!(
        "runner={}",
        std::env::var("NATIVE_CLI_PERF_RUNNER").unwrap_or_else(|_| "unspecified".to_owned())
    );
    println!("os={}-{}", std::env::consts::OS, std::env::consts::ARCH);
    println!("rustc={}", rustc_version()?);
    println!("build_profile=release");
    println!(
        "head_sha={}",
        std::env::var("GITHUB_SHA").unwrap_or_else(|_| "local".to_owned())
    );
    println!("engine_version={}", engine.engine_version);
    println!("build_id={}", engine.build_id);
    print_stats("CLI startup / end-to-end process invocation", &startup);
    print_stats("baseline native scenario runtime", &baseline_runtime);
    print_stats(
        "housing-comparison native scenario runtime",
        &housing_runtime,
    );
    Ok(())
}

fn cli_binary_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let release_dir = std::env::current_exe()?
        .parent()
        .and_then(Path::parent)
        .ok_or("could not locate release directory")?
        .to_owned();
    let executable = if cfg!(windows) {
        "riose-run.exe"
    } else {
        "riose-run"
    };
    Ok(release_dir.join(executable))
}

fn measure_startup(binary: &Path) -> Result<Vec<Duration>, Box<dyn std::error::Error>> {
    let mut samples = Vec::with_capacity(MEASURED_RUNS);
    for iteration in 0..(WARMUP_RUNS + MEASURED_RUNS) {
        let start = Instant::now();
        let mut child = Command::new(binary)
            .args(["--input", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?;
        child
            .stdin
            .take()
            .ok_or("CLI stdin was not piped")?
            .write_all(MINIMAL_REQUEST)?;
        let status = child.wait()?;
        let elapsed = start.elapsed();
        if !status.success() {
            return Err(format!("CLI startup sample exited with {status}").into());
        }
        if iteration >= WARMUP_RUNS {
            samples.push(elapsed);
        }
    }
    Ok(samples)
}

fn measure_scenario(
    request: NativeScenarioRequest,
) -> Result<Vec<Duration>, Box<dyn std::error::Error>> {
    let mut samples = Vec::with_capacity(MEASURED_RUNS);
    for iteration in 0..(WARMUP_RUNS + MEASURED_RUNS) {
        let request = request.clone();
        let start = Instant::now();
        let result: NativeRunResult = run_native_scenario(black_box(request))?;
        let elapsed = start.elapsed();
        black_box(result);
        if iteration >= WARMUP_RUNS {
            samples.push(elapsed);
        }
    }
    Ok(samples)
}

fn print_stats(label: &str, samples: &[Duration]) {
    let mut nanos: Vec<u128> = samples.iter().map(Duration::as_nanos).collect();
    nanos.sort_unstable();
    let median = (nanos[(nanos.len() - 1) / 2] + nanos[nanos.len() / 2]) / 2;
    println!("measurement_label={label}");
    println!("runs={}", samples.len());
    println!("median_ns={median}");
    println!("min_ns={}", nanos[0]);
    println!("max_ns={}", nanos[nanos.len() - 1]);
}

fn rustc_version() -> Result<String, Box<dyn std::error::Error>> {
    let output = Command::new("rustc").arg("--version").output()?;
    if !output.status.success() {
        return Err("rustc --version failed".into());
    }
    Ok(String::from_utf8(output.stdout)?.trim().to_owned())
}
