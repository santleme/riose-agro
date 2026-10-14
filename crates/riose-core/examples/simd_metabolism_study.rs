//! Issue #91 experiment only. No production caller selects this implementation.
use riose_core::{update_metabolism, GAIN_FACTOR, MAINTENANCE_KG_DM, MAX_BATCH};
use serde_json::{json, Value};
use std::{hint::black_box, process::Command, time::Instant};

type Kernel = unsafe fn(&[f64], &mut [f64]) -> Result<(), &'static str>;
const REPETITIONS: usize = 31;
const WARMUPS: usize = 5;

fn validate(input: &[f64], output: &[f64]) -> Result<(), &'static str> {
    if input.len() % 4 != 0 {
        return Err("input length must be divisible by four");
    }
    if input.len() / 4 > MAX_BATCH {
        return Err("batch exceeds maximum size");
    }
    if output.len() != input.len() / 2 {
        return Err("output length must be twice the animal count");
    }
    Ok(())
}

fn available() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        std::is_x86_feature_detected!("avx2")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

#[inline(never)]
fn select(supported: bool) -> Kernel {
    #[cfg(target_arch = "x86_64")]
    if supported {
        return avx2;
    }
    let _ = supported;
    update_metabolism
}

unsafe fn dispatch(input: &[f64], output: &mut [f64]) -> Result<(), &'static str> {
    // SAFETY: CPU detection guards the target-feature implementation.
    unsafe { select(available())(input, output) }
}

#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
unsafe fn avx2(input: &[f64], output: &mut [f64]) -> Result<(), &'static str> {
    use std::arch::x86_64::*;
    validate(input, output)?;
    let count = input.len() / 4;
    let vector_count = count / 4 * 4;
    // SAFETY: caller detected AVX2; validation and vector_count bound every
    // unaligned load/store to the nonoverlapping Rust slice allocations.
    unsafe {
        let zero = _mm256_setzero_pd();
        for i in (0..vector_count).step_by(4) {
            let p = input.as_ptr().add(i * 4);
            let a = _mm256_loadu_pd(p);
            let b = _mm256_loadu_pd(p.add(4));
            let c = _mm256_loadu_pd(p.add(8));
            let d = _mm256_loadu_pd(p.add(12));
            let ab_lo = _mm256_unpacklo_pd(a, b);
            let ab_hi = _mm256_unpackhi_pd(a, b);
            let cd_lo = _mm256_unpacklo_pd(c, d);
            let cd_hi = _mm256_unpackhi_pd(c, d);
            let weight = _mm256_permute2f128_pd::<0x20>(ab_lo, cd_lo);
            let energy = _mm256_permute2f128_pd::<0x20>(ab_hi, cd_hi);
            let intake = _mm256_permute2f128_pd::<0x31>(ab_lo, cd_lo);
            let resting = _mm256_permute2f128_pd::<0x31>(ab_hi, cd_hi);
            let maintenance = _mm256_div_pd(
                _mm256_mul_pd(
                    _mm256_set1_pd(MAINTENANCE_KG_DM),
                    _mm256_div_pd(weight, _mm256_set1_pd(360.0)),
                ),
                _mm256_set1_pd(24.0),
            );
            let gain = _mm256_mul_pd(
                _mm256_sub_pd(intake, maintenance),
                _mm256_set1_pd(GAIN_FACTOR),
            );
            let weight = _mm256_max_pd(_mm256_add_pd(weight, gain), _mm256_set1_pd(200.0));
            let activity = _mm256_blendv_pd(
                _mm256_sub_pd(
                    _mm256_mul_pd(intake, _mm256_set1_pd(4.0)),
                    _mm256_set1_pd(1.5),
                ),
                _mm256_set1_pd(5.0),
                _mm256_cmp_pd::<_CMP_NEQ_UQ>(resting, zero),
            );
            let energy = _mm256_add_pd(energy, activity);
            // Ordered comparisons preserve clamp's NaN and signed-zero behavior.
            let energy = _mm256_blendv_pd(energy, zero, _mm256_cmp_pd::<_CMP_LT_OQ>(energy, zero));
            let upper = _mm256_set1_pd(100.0);
            let energy =
                _mm256_blendv_pd(energy, upper, _mm256_cmp_pd::<_CMP_GT_OQ>(energy, upper));
            let lo = _mm256_unpacklo_pd(weight, energy);
            let hi = _mm256_unpackhi_pd(weight, energy);
            let p = output.as_mut_ptr().add(i * 2);
            _mm256_storeu_pd(p, _mm256_permute2f128_pd::<0x20>(lo, hi));
            _mm256_storeu_pd(p.add(4), _mm256_permute2f128_pd::<0x31>(lo, hi));
        }
    }
    update_metabolism(&input[vector_count * 4..], &mut output[vector_count * 2..])
}

fn fixture(count: usize, mixed: bool) -> Vec<f64> {
    (0..count)
        .flat_map(|i| {
            if mixed {
                [
                    190.0 + (i % 300) as f64,
                    (i % 111) as f64 - 5.0,
                    (i % 31) as f64 / 10.0,
                    (i % 2) as f64,
                ]
            } else {
                [330.0 + (i % 70) as f64, 75.0, 0.4, 0.0]
            }
        })
        .collect()
}

fn assert_parity(input: &[f64], kernel: Kernel) {
    let mut expected = vec![0.0; input.len() / 2];
    let mut actual = expected.clone();
    update_metabolism(input, &mut expected).unwrap();
    // SAFETY: kernel is selected only after CPU detection, or is scalar.
    unsafe { kernel(input, &mut actual).unwrap() };
    for (i, (a, b)) in expected.iter().zip(&actual).enumerate() {
        assert_eq!(a.to_bits(), b.to_bits(), "output {i}: {a:?} != {b:?}");
    }
}

fn equivalence(kernel: Kernel) -> Value {
    for count in [0, 1, 2, 3, 4, 5, 7, 15, 1000, 10_000, 100_000] {
        for mixed in [false, true] {
            assert_parity(&fixture(count, mixed), kernel);
        }
    }
    let golden: Value = serde_json::from_str(include_str!(
        "../../../tests/scenario-goldens/housing-comparison.json"
    ))
    .unwrap();
    // B3 baseline state projected into the packed kernel ABI, with each intake
    // and resting boundary exercised. This does not replace full B3 replay.
    let mut b3 = Vec::new();
    for animal in golden["replayManifest"]["baseline"]["animals"]
        .as_array()
        .unwrap()
    {
        for intake in [0.0, 0.4, 1.2, 3.1] {
            for resting in [0.0, 1.0] {
                b3.extend_from_slice(&[
                    animal["weight"].as_f64().unwrap(),
                    animal["energy"].as_f64().unwrap(),
                    intake,
                    resting,
                ]);
            }
        }
    }
    assert_parity(&b3, kernel);
    json!({"bitwiseEqual":true,"tolerance":0,"b3ProjectedAnimals":b3.len()/4,
        "sizes":[0,1,2,3,4,5,7,15,1000,10000,100000]})
}

fn statistics(samples: Vec<f64>) -> Value {
    let mut sorted = samples.clone();
    sorted.sort_by(f64::total_cmp);
    json!({"sampleCount":samples.len(),"median":sorted[sorted.len()/2],
        "spread":{"min":sorted[0],"max":sorted[sorted.len()-1],
        "range":sorted[sorted.len()-1]-sorted[0]},"rawObservations":samples})
}

fn measure<F: FnMut()>(mut f: F, iterations: usize) -> Value {
    for _ in 0..WARMUPS {
        for _ in 0..iterations {
            f();
        }
    }
    statistics(
        (0..REPETITIONS)
            .map(|_| {
                let start = Instant::now();
                for _ in 0..iterations {
                    f();
                }
                start.elapsed().as_secs_f64() * 1000.0 / iterations as f64
            })
            .collect(),
    )
}

fn command(program: &str, args: &[&str]) -> String {
    let out = Command::new(program).args(args).output().unwrap();
    assert!(out.status.success(), "{program} failed");
    String::from_utf8(out.stdout).unwrap().trim().to_owned()
}

fn main() {
    let profile =
        std::env::var("SIMD_STUDY_PROFILE").expect("set SIMD_STUDY_PROFILE to the build flags");
    let supported = available();
    let direct = select(supported);
    let rotation = std::env::var("SIMD_STUDY_RUN")
        .unwrap_or_else(|_| "1".into())
        .parse::<usize>()
        .unwrap()
        .saturating_sub(1)
        % 4;
    let parity = equivalence(direct);
    equivalence(select(false));
    let mut measurements = Vec::new();
    for count in [1000, 10_000, 100_000] {
        for mixed in [false, true] {
            let dataset = if mixed {
                "mixed-clamps-resting"
            } else {
                "existing-native-benchmark"
            };
            let input = fixture(count, mixed);
            let mut output = vec![0.0; count * 2];
            let iterations = 1_000_000 / count;
            let mut implementations = [
                ("current", update_metabolism as Kernel),
                ("explicit-avx2-direct", direct),
                ("runtime-dispatch", dispatch as Kernel),
                ("forced-fallback", select(false)),
            ];
            implementations.rotate_left(rotation);
            for (name, kernel) in implementations {
                let kernel_time = measure(
                    || {
                        // SAFETY: selection guards AVX2; all slice lengths are valid.
                        unsafe {
                            black_box(kernel)(black_box(&input), black_box(&mut output)).unwrap()
                        };
                        black_box(&output);
                    },
                    iterations,
                );
                measurements.push(json!({"phase":"engine","metric":"metabolismBatch","unit":"ms",
                    "statistics":kernel_time,"population":count,"scope":"numeric-kernel-only",
                    "implementation":name,"dataset":dataset,"source":"preallocated packed f64 kernel",
                    "bufferBytes":count*6*8,"iterationsPerSample":iterations}));
                let total_time = measure(
                    || {
                        let input = fixture(count, mixed);
                        let mut output = vec![0.0; count * 2];
                        // SAFETY: selected CPU-compatible function; initialized disjoint buffers.
                        unsafe {
                            black_box(kernel)(black_box(&input), black_box(&mut output)).unwrap()
                        };
                        black_box(&output);
                        drop(output);
                        drop(input);
                    },
                    iterations,
                );
                measurements.push(
                    json!({"phase":"engine","metric":"allocateFillKernelRelease","unit":"ms",
                    "statistics":total_time,"population":count,"scope":"numeric-kernel-only",
                    "implementation":name,"dataset":dataset,"source":"owned buffer lifecycle",
                    "iterationsPerSample":iterations}),
                );
            }
            measurements.push(json!({"phase":"engine","metric":"allocateFillRelease","unit":"ms",
                "population":count,"dataset":dataset,"implementation":"shared-setup",
                "source":"input construction, zeroed output allocation and release; kernel excluded",
                "statistics":measure(|| { let input=fixture(count,mixed); let output=vec![0.0;count*2];
                    black_box((&input,&output)); }, iterations)}));
        }
    }
    // Cached feature detection + choice only; no kernel work or allocations.
    let dispatch_cost = measure(
        || {
            black_box(select(black_box(available())));
        },
        100_000,
    );
    let current_dir = std::env::current_dir().unwrap();
    let dirty = !command("git", &["status", "--porcelain"]).is_empty();
    let timed = [
        "Preallocated kernel calls, normalized per call across matched repeated batches.",
        "Separately measured buffer allocation/fill/release plus kernel.",
        "Shared setup allocation/fill/release.",
    ];
    let not_timed = [
        "Compilation and process startup.",
        "JSON serialization, FarmEngine, Worker, UI, renderer.",
    ];
    let empty = json!({"status":"not-measured","measurements":[]});
    let report = json!({"schemaVersion":2,
        "benchmark":{"name":"native-metabolism-simd-study","source":{"revision":command("git",&["rev-parse","HEAD"]),"dirty":dirty}},
        "runtime":{"platform":std::env::consts::OS,"rust":command("rustc",&["-Vv"]),"target":"x86_64-unknown-linux-gnu"},
        "hardware":{"os":command("uname",&["-a"]),"architecture":std::env::consts::ARCH,
            "cpu":std::fs::read_to_string("/proc/cpuinfo").unwrap().lines().find(|s|s.starts_with("model name")).unwrap(),"gpuMemoryBytes":null},
        "workload":{"seed":"deterministic-index-no-rng","populations":[{"animals":1000,"scope":"numeric-kernel-only"},{"animals":10000,"scope":"numeric-kernel-only"},{"animals":100000,"scope":"numeric-kernel-only"}]},
        "configuration":{"warmupRuns":WARMUPS,"repetitions":REPETITIONS,"buildProfile":"release; thin LTO; codegen-units=1; panic=abort","flags":profile,"avx2Available":supported,"precision":"f64, no fast math, no explicit FMA","implementationOrderRotation":rotation},
        "limits":{"farmEngineMaxAnimals":10000,"rendererMaxAnimals":10000,"numericKernelMaxAnimalsMeasured":100000},
        "phases":{"engine":{"status":"measured","measurements":measurements},"snapshot":empty,"serialization":empty,"worker":empty,"ui":empty,"layout":empty,"render":empty,"startup":empty,
            "coldStartup":empty,"warmStartup":empty,"bridgeMarshaling":empty,"fullScenario":empty,"uiEndToEnd":empty,"memory":empty},
        "timingBoundaries":[{"phase":"engine","timed":timed,"whatIsTimed":timed,"notTimed":not_timed,"whatIsNotTimed":not_timed}],
        "results":{"equivalence":parity,"selectionOverheadMs":dispatch_cost,"workingDirectory":current_dir},
        "limitations":["Isolated packed kernel; no full-engine speedup claim.","One Intel AVX2 host under WSL2; no second hardware or WASM SIMD claim.","Forced feature-unavailable selection tested; an actual non-AVX2 CPU is unavailable.","B3 state projection checks kernel inputs; canonical full B3 replay is a separate workspace test.","Setup observation includes release; no conversion to SoA or additional SIMD allocation."]});
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bitwise_equivalence_including_b3_clamps_tails_and_fallback() {
        equivalence(select(false));
        if available() {
            equivalence(select(true));
        }
    }
    #[test]
    fn malformed_inputs_match_baseline_errors() {
        for input in [vec![0.0; 3], vec![0.0; 4], vec![0.0; (MAX_BATCH + 1) * 4]] {
            let expected = update_metabolism(&input, &mut []);
            // SAFETY: select returns a CPU-compatible function.
            assert_eq!(unsafe { select(available())(&input, &mut []) }, expected);
        }
    }
    #[test]
    fn special_values_match_baseline_bits() {
        for value in [-0.0, 0.0, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
            let input = [
                value, 75.0, 0.4, 0.0, 360.0, value, 0.4, 1.0, 360.0, 75.0, value, 0.0, 360.0,
                75.0, 0.4, value,
            ];
            assert_parity(&input, select(available()));
        }
    }
}
