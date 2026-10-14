use riose_core::{FarmConfig, FarmEngine, Housing};
use std::hint::black_box;
use std::time::{Duration, Instant};

fn env<T: std::str::FromStr>(key: &str, default: T) -> Result<T, String> {
    std::env::var(key)
        .ok()
        .map(|value| value.parse().map_err(|_| format!("invalid {key}")))
        .unwrap_or(Ok(default))
}

fn run(seed: u32, animals: usize, days: u32, housing: Housing) -> Result<Vec<u8>, String> {
    let mut engine = FarmEngine::new(seed, animals)?;
    engine.configure(FarmConfig {
        housing,
        ..FarmConfig::default()
    })?;
    engine.tick(days.checked_mul(24).ok_or("days overflow")?)?;
    serde_json::to_vec(&engine.snapshot()).map_err(|error| error.to_string())
}

fn process_memory_kb() -> Result<(u64, u64), String> {
    let status = std::fs::read_to_string("/proc/self/status")
        .map_err(|error| format!("read /proc/self/status: {error}"))?;
    let value = |name: &str| -> Result<u64, String> {
        let line = status
            .lines()
            .find(|line| line.starts_with(name))
            .ok_or_else(|| format!("missing {name} in /proc/self/status"))?;
        line.split_whitespace()
            .nth(1)
            .ok_or_else(|| format!("missing value for {name}"))?
            .parse()
            .map_err(|_| format!("invalid value for {name}"))
    };
    Ok((value("VmRSS:")?, value("VmHWM:")?))
}

fn main() -> Result<(), String> {
    let seed = env("RIOSE_BENCH_SEED", 2026_u32)?;
    let animals = env("RIOSE_BENCH_ANIMALS", 10_000_usize)?;
    let days = env("RIOSE_BENCH_DAYS", 30_u32)?;
    let runs = env("RIOSE_BENCH_RUNS", 21_usize)?;
    let warmups = env("RIOSE_BENCH_WARMUPS", 3_usize)?;
    let housing = match std::env::var("RIOSE_BENCH_HOUSING")
        .unwrap_or_else(|_| "pasture".to_owned())
        .as_str()
    {
        "pasture" => Housing::Pasture,
        "barn" => Housing::Barn,
        _ => return Err("RIOSE_BENCH_HOUSING must be pasture or barn".to_owned()),
    };

    let memory_tracing = std::env::var_os("RIOSE_BENCH_MEMORY_TRACE_OUT").is_some();
    let mut memory_trace = Vec::new();
    if memory_tracing {
        let (rss_kb, hwm_kb) = process_memory_kb()?;
        memory_trace.push(format!("initial,0,{rss_kb},{hwm_kb}"));
    }
    for index in 0..warmups {
        black_box(run(seed, animals, days, housing)?);
        if memory_tracing {
            let (rss_kb, hwm_kb) = process_memory_kb()?;
            memory_trace.push(format!("warmup,{},{rss_kb},{hwm_kb}", index + 1));
        }
    }
    let mut samples = Vec::with_capacity(runs);
    let mut final_snapshot = Vec::new();
    for index in 0..runs {
        let start = Instant::now();
        let result = black_box(run(seed, animals, days, housing)?);
        samples.push(start.elapsed());
        final_snapshot = result;
        if memory_tracing {
            let (rss_kb, hwm_kb) = process_memory_kb()?;
            memory_trace.push(format!("sample,{},{rss_kb},{hwm_kb}", index + 1));
        }
    }
    samples.sort_unstable();
    let p50 = percentile(&samples, 50);
    let p95 = percentile(&samples, 95);

    if let Some(path) = std::env::var_os("RIOSE_BENCH_SNAPSHOT_OUT") {
        std::fs::write(path, final_snapshot).map_err(|error| error.to_string())?;
    }
    if let Some(path) = std::env::var_os("RIOSE_BENCH_MEMORY_TRACE_OUT") {
        let trace = format!(
            "phase,index,vm_rss_kb,vm_hwm_kb\n{}\n",
            memory_trace.join("\n")
        );
        std::fs::write(path, trace).map_err(|error| error.to_string())?;
    }
    println!(
        "variant={}",
        if cfg!(feature = "history-ring") {
            "history-ring"
        } else {
            "sequential"
        }
    );
    println!(
        "seed={seed} animals={animals} days={days} housing={:?}",
        housing
    );
    println!("warmups={warmups} runs={runs}");
    println!("p50_ms={:.3} p95_ms={:.3}", millis(p50), millis(p95));
    println!(
        "samples_ms={}",
        samples
            .iter()
            .map(|sample| format!("{:.3}", millis(*sample)))
            .collect::<Vec<_>>()
            .join(",")
    );
    Ok(())
}

fn percentile(samples: &[Duration], percentile: usize) -> Duration {
    let index = (samples.len() * percentile).div_ceil(100).saturating_sub(1);
    samples[index.min(samples.len() - 1)]
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
