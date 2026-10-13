//! Reproducible end-to-end native simulation benchmark for the REA study.

use riose_core::{
    compare_housing, FarmConfig, FarmEngine, FarmSnapshot, Housing, NativeScenarioRequest,
};
use std::hint::black_box;
use std::time::{Duration, Instant};

const SEED: u32 = 2026;
const ANIMALS: usize = 10_000;
const WARMUPS: usize = 3;
const SAMPLES: usize = 21;

fn run_comparison() -> Result<Vec<u8>, String> {
    let mut engine = FarmEngine::new(SEED, ANIMALS)?;
    engine.configure(FarmConfig::default())?;
    let comparison = compare_housing(&engine.snapshot(), 30)?;
    serde_json::to_vec(&comparison).map_err(|error| error.to_string())
}

fn final_snapshots() -> Result<(FarmSnapshot, FarmSnapshot), String> {
    let mut pasture = FarmEngine::new(SEED, ANIMALS)?;
    pasture.configure(FarmConfig::default())?;
    pasture.tick(30 * 24)?;

    let mut barn = FarmEngine::new(SEED, ANIMALS)?;
    barn.configure(FarmConfig {
        housing: Housing::Barn,
        ..FarmConfig::default()
    })?;
    barn.tick(30 * 24)?;
    Ok((pasture.snapshot(), barn.snapshot()))
}

fn initial_request() -> Result<Vec<u8>, String> {
    let mut engine = FarmEngine::new(SEED, ANIMALS)?;
    engine.configure(FarmConfig::default())?;
    let request = NativeScenarioRequest::HousingComparison {
        version: 1,
        snapshot: engine.snapshot(),
        days: 30,
    };
    serde_json::to_vec(&request).map_err(|error| error.to_string())
}

fn main() -> Result<(), String> {
    for _ in 0..WARMUPS {
        black_box(run_comparison()?);
    }

    let mut samples = Vec::with_capacity(SAMPLES);
    let mut final_comparison = None;
    for _ in 0..SAMPLES {
        let start = Instant::now();
        let comparison_bytes = black_box(run_comparison()?);
        samples.push(start.elapsed());
        final_comparison = Some(comparison_bytes);
    }

    samples.sort_unstable();
    let median = samples[SAMPLES / 2];
    let p95 = samples[((SAMPLES - 1) * 95 + 99) / 100];
    println!("animals={ANIMALS} days=30 comparison_arms=2 warmups={WARMUPS} samples={SAMPLES}");
    println!("median_ms={:.3} p95_ms={:.3}", millis(median), millis(p95));
    println!(
        "samples_ms={}",
        samples
            .iter()
            .map(|duration| format!("{:.3}", millis(*duration)))
            .collect::<Vec<_>>()
            .join(",")
    );

    if let Some(path) = std::env::var_os("RIOSE_COMPARISON_OUT") {
        let bytes = final_comparison.expect("at least one benchmark sample");
        std::fs::write(path, bytes).map_err(|error| error.to_string())?;
    }
    if let Some(path) = std::env::var_os("RIOSE_FULL_SNAPSHOT_OUT") {
        let snapshots = final_snapshots()?;
        let bytes = serde_json::to_vec(&snapshots).map_err(|error| error.to_string())?;
        std::fs::write(path, bytes).map_err(|error| error.to_string())?;
    }
    if let Some(path) = std::env::var_os("RIOSE_REQUEST_OUT") {
        std::fs::write(path, initial_request()?).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
