use std::hint::black_box;
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Instant;

use riose_core::update_metabolism;

fn main() {
    let repetitions = 21;
    let warmup_runs = 1;
    let mut measurements = Vec::new();
    for count in [100, 1_000, 10_000, 100_000] {
        let mut input = Vec::with_capacity(count * 4);
        for index in 0..count {
            input.extend_from_slice(&[330.0 + (index % 70) as f64, 75.0, 0.4, 0.0]);
        }
        let mut output = vec![0.0; count * 2];
        for _ in 0..warmup_runs {
            update_metabolism(black_box(&input), black_box(&mut output)).unwrap();
        }
        let mut elapsed = Vec::with_capacity(repetitions);
        for _ in 0..repetitions {
            let start = Instant::now();
            update_metabolism(black_box(&input), black_box(&mut output)).unwrap();
            elapsed.push(start.elapsed().as_secs_f64() * 1_000.0);
            black_box(&output);
        }
        elapsed.sort_by(f64::total_cmp);
        let median = if repetitions % 2 == 0 {
            (elapsed[repetitions / 2 - 1] + elapsed[repetitions / 2]) / 2.0
        } else {
            elapsed[repetitions / 2]
        };
        measurements.push(serde_json::json!({
            "phase": "engine",
            "metric": "metabolismBatch",
            "unit": "ms",
            "statistics": {
                "sampleCount": elapsed.len(),
                "median": median,
                "spread": {"min": elapsed.first(), "max": elapsed.last(), "range": elapsed.last().zip(elapsed.first()).map(|(max, min)| *max - *min)},
            },
            "population": count,
            "scope": "numeric-kernel-only",
            "implementation": "native-rust",
            "memory": null,
        }));
    }
    let phase = |items| serde_json::json!({"status":"measured","measurements":items});
    let not_measured = || serde_json::json!({"status":"not-measured","measurements":[]});
    let revision = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());
    let dirty = Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| !output.stdout.is_empty())
        .unwrap_or(false);
    let rustc = Command::new("rustc")
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_owned());
    let report = serde_json::json!({
        "schemaVersion": 1,
        "benchmark": {"name":"native-metabolism-kernel","source":{"revision":revision,"dirty":dirty}},
        "runtime": {"platform":std::env::consts::OS,"rust":rustc,"crateVersion":env!("CARGO_PKG_VERSION")},
        "hardware": {"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"cpu":null,"gpuMemoryBytes":null},
        "workload": {"seed":"deterministic-index-no-rng","populations":[
            {"animals":100,"scope":"numeric-kernel-only"},
            {"animals":1000,"scope":"numeric-kernel-only"},
            {"animals":10000,"scope":"numeric-kernel-only"},
            {"animals":100000,"scope":"numeric-kernel-only","limit":"isolated numeric kernel; not FarmEngine or renderer"}
        ]},
        "configuration": {"warmupRuns":warmup_runs,"repetitions":repetitions},
        "limits": {"farmEngineMaxAnimals":10000,"rendererMaxAnimals":10000,"numericKernelMaxAnimalsMeasured":100000},
        "phases": {
            "engine":phase(measurements),"snapshot":not_measured(),"serialization":not_measured(),"worker":not_measured(),
            "ui":not_measured(),"layout":not_measured(),"render":not_measured(),"startup":not_measured()
        },
        "timingBoundaries": [{
            "phase":"engine",
            "timed":["Native Rust metabolism kernel over preallocated input and output vectors."],
            "notTimed":["Input construction, FarmEngine, Worker transfer, UI, rendering, and process startup."]
        }],
        "results": {"workload":"pure Rust metabolism loop over preallocated vectors; no full FarmEngine runner"},
        "limitations": ["This is an isolated numeric kernel measurement. It does not measure FarmEngine, Worker, UI, rendering, or GPU memory."],
    });
    let validator = format!(
        "{}/../../scripts/validate-benchmark-report.mjs",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut child = Command::new("node")
        .arg(validator)
        .stdin(Stdio::piped())
        .spawn()
        .expect("node is required to validate the shared benchmark report schema");
    child
        .stdin
        .as_mut()
        .expect("validator stdin is piped")
        .write_all(&serde_json::to_vec(&report).expect("benchmark report serializes"))
        .expect("write benchmark report to schema validator");
    let validation = child.wait().expect("wait for benchmark schema validator");
    assert!(
        validation.success(),
        "benchmark report failed shared JSON Schema validation"
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("benchmark report serializes")
    );
}
