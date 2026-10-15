use riose_core::update_metabolism;
use serde_json::{json, Value};
use std::{hint::black_box, process::Command, time::Instant};

unsafe extern "C" {
    fn riose_cpp_update_metabolism(count: usize, input: *const f64, output: *mut f64) -> i32;
    fn riose_cpp_allocate(count: usize, input: *mut *mut f64, output: *mut *mut f64) -> i32;
    fn riose_cpp_free(input: *mut f64, output: *mut f64);
}

const REPETITIONS: usize = 31;
const WARMUPS: usize = 3;

fn fixture(count: usize) -> Vec<f64> {
    (0..count).flat_map(|i| [250.0 + (i % 240) as f64, (i % 101) as f64, (i % 31) as f64 / 10.0, if i % 2 == 0 { 0.0 } else { 1.0 }]).collect()
}

fn median(mut values: Vec<f64>) -> Value {
    values.sort_by(f64::total_cmp);
    let n = values.len();
    json!({"sampleCount": n, "median": values[n / 2], "spread": {"min": values[0], "max": values[n-1], "range": values[n-1] - values[0]}})
}

fn main() {
    let mut measurements = Vec::new();
    let mut parity = Vec::new();
    for count in [1_000, 10_000, 100_000] {
        let input = fixture(count);
        let mut rust_out = vec![0.0; count * 2];
        let mut cpp_out = vec![0.0; count * 2];
        update_metabolism(&input, &mut rust_out).unwrap();
        let status = unsafe { riose_cpp_update_metabolism(count, input.as_ptr(), cpp_out.as_mut_ptr()) };
        assert_eq!(status, 0);
        let max_abs = rust_out.iter().zip(&cpp_out).map(|(a,b)| (a-b).abs()).fold(0.0_f64, f64::max);
        assert!(rust_out.iter().zip(&cpp_out).all(|(a,b)| a.to_bits() == b.to_bits()), "kernel output mismatch at {count}");
        parity.push(json!({"animals":count,"maxAbsoluteDifference":max_abs,"bitwiseEqual":true}));

        let mut rust_kernel = Vec::with_capacity(REPETITIONS);
        let mut cpp_ffi_kernel = Vec::with_capacity(REPETITIONS);
        let mut rust_owned_total = Vec::with_capacity(REPETITIONS);
        let mut cpp_owned_total = Vec::with_capacity(REPETITIONS);
        for _ in 0..WARMUPS {
            update_metabolism(black_box(&input), black_box(&mut rust_out)).unwrap();
            assert_eq!(unsafe { riose_cpp_update_metabolism(count, input.as_ptr(), cpp_out.as_mut_ptr()) }, 0);
        }
        for _ in 0..REPETITIONS {
            let start = Instant::now();
            update_metabolism(black_box(&input), black_box(&mut rust_out)).unwrap();
            rust_kernel.push(start.elapsed().as_secs_f64() * 1000.0);
            black_box(&rust_out);

            let start = Instant::now();
            let status = unsafe { riose_cpp_update_metabolism(count, input.as_ptr(), cpp_out.as_mut_ptr()) };
            assert_eq!(status, 0);
            cpp_ffi_kernel.push(start.elapsed().as_secs_f64() * 1000.0);
            black_box(&cpp_out);

            let start = Instant::now();
            let mut owned_input = fixture(count);
            let mut owned_output = vec![0.0; count * 2];
            update_metabolism(&owned_input, &mut owned_output).unwrap();
            rust_owned_total.push(start.elapsed().as_secs_f64() * 1000.0);
            black_box((&mut owned_input, &owned_output));

            let start = Instant::now();
            let (mut raw_input, mut raw_output) = (std::ptr::null_mut(), std::ptr::null_mut());
            assert_eq!(unsafe { riose_cpp_allocate(count, &mut raw_input, &mut raw_output) }, 0);
            let input_slice = unsafe { std::slice::from_raw_parts_mut(raw_input, count * 4) };
            for (i, chunk) in input_slice.chunks_exact_mut(4).enumerate() {
                chunk.copy_from_slice(&[250.0 + (i % 240) as f64, (i % 101) as f64, (i % 31) as f64 / 10.0, if i % 2 == 0 { 0.0 } else { 1.0 }]);
            }
            assert_eq!(unsafe { riose_cpp_update_metabolism(count, raw_input, raw_output) }, 0);
            unsafe { riose_cpp_free(raw_input, raw_output) };
            cpp_owned_total.push(start.elapsed().as_secs_f64() * 1000.0);
        }
        for (name, values, scope) in [
            ("rust-native", rust_kernel, "preallocated-kernel"),
            ("cpp-c-abi", cpp_ffi_kernel, "preallocated-kernel-plus-ffi"),
            ("rust-owned", rust_owned_total, "allocate-fill-kernel-free"),
            ("cpp-owned", cpp_owned_total, "allocate-fill-c-abi-kernel-free"),
        ] {
            measurements.push(json!({"phase":"engine","metric":"metabolismBatch","unit":"ms","statistics":median(values),"population":count,"scope":scope,"implementation":name,"source":"experiments/cpp-metabolism/src/main.rs","memory":null}));
        }
    }
    let revision = Command::new("git").args(["rev-parse","HEAD"]).output().ok().filter(|o|o.status.success()).map(|o|String::from_utf8_lossy(&o.stdout).trim().to_owned());
    let dirty = Command::new("git").args(["status","--porcelain"]).output().ok().filter(|o|o.status.success()).map(|o|!o.stdout.is_empty()).unwrap_or(true);
    let rustc = Command::new("rustc").arg("--version").output().ok().map(|o|String::from_utf8_lossy(&o.stdout).trim().to_owned());
    let cxx = Command::new("c++").arg("--version").output().ok().and_then(|o|String::from_utf8_lossy(&o.stdout).lines().next().map(str::to_owned));
    let cpu = Command::new("lscpu").output().ok().and_then(|o|String::from_utf8_lossy(&o.stdout).lines().find(|line|line.starts_with("Model name:")).map(|line|line.split_once(':').map(|(_,value)|value.trim().to_owned()).unwrap_or_default()));
    let report = json!({
        "schemaVersion":1,"benchmark":{"name":"rust-cpp-metabolism-prototype","source":{"revision":revision,"dirty":dirty}},
        "runtime":{"platform":std::env::consts::OS,"rust":rustc,"cxx":cxx,"cxxFlags":["-std=c++20","-O3","-fno-fast-math","-ffp-contract=off"]},
        "hardware":{"os":std::env::consts::OS,"architecture":std::env::consts::ARCH,"cpu":cpu,"gpuMemoryBytes":null},
        "workload":{"seed":"deterministic-index-fixture-v1","populations":[{"animals":1000,"scope":"numeric-kernel-only"},{"animals":10000,"scope":"numeric-kernel-only"},{"animals":100000,"scope":"numeric-kernel-only"}]},
        "configuration":{"warmupRuns":WARMUPS,"repetitions":REPETITIONS,"precision":"f64 / IEEE-754 binary64","rustOptimization":"--release (Cargo default target CPU)","cppOptimization":"-O3 -fno-fast-math -ffp-contract=off"},
        "limits":{"farmEngineMaxAnimals":10000,"rendererMaxAnimals":10000,"numericKernelMaxAnimalsMeasured":100000},
        "phases":{"engine":{"status":"measured","measurements":measurements},"snapshot":{"status":"not-measured","measurements":[]},"serialization":{"status":"not-measured","measurements":[]},"worker":{"status":"not-measured","measurements":[]},"ui":{"status":"not-measured","measurements":[]},"layout":{"status":"not-measured","measurements":[]},"render":{"status":"not-measured","measurements":[]},"startup":{"status":"not-measured","measurements":[]}},
        "timingBoundaries":[{"phase":"engine","timed":["Rust native update_metabolism call over preallocated slices.","C++ kernel via one C ABI call over the same caller-owned preallocated buffers.","Allocation/fill/kernel/release for each language using corresponding owned buffers."],"notTimed":["Process startup and compilation; those are reported separately as build/setup considerations.","FarmEngine orchestration, worker messaging, UI, rendering."]}],
        "results":{"fixture":"same deterministic vectors for both implementations","parity":parity,"measurements":"phase.engine.measurements; kernel and allocation/ownership measurements use matched scopes","buildAndPackaging":{"measuredReleaseBuildMs":std::env::var("RIOSE_CPP_BUILD_MS").ok().and_then(|v|v.parse::<f64>().ok()),"cpp":"benchmark-only C++ translation unit compiled and archived by Cargo build.rs; no production dependency or runtime library","ffi":"one C ABI call per batch; caller owns buffers; separately measured allocation/ownership path uses C++ new[]/delete[]"},"decision":"no-go for production C++: this prototype does not establish a material workload-level advantage; retain Rust as the single kernel implementation pending application-level evidence"},
        "limitations":["Only finite deterministic fixture data is covered; malformed and NaN inputs are outside the model-state domain.","The pure kernel is profile-identified as the first deterministic scalar boundary in current-system-audit.md, but this benchmark does not establish a FarmEngine-level gain.","C++ is an isolated experiment; benchmark build and link path is not a supported production package.","Times are host-specific; compare only measurements with identical configuration and fixture."]
    });
    let validator = format!("{}/../../scripts/benchmarks/validate-benchmark-report.mjs", env!("CARGO_MANIFEST_DIR"));
    let mut child = Command::new("node").arg(validator).stdin(std::process::Stdio::piped()).spawn().expect("node benchmark validator required");
    use std::io::Write;
    child.stdin.take().unwrap().write_all(&serde_json::to_vec(&report).unwrap()).unwrap();
    assert!(child.wait().unwrap().success(), "report failed shared benchmark schema validation");
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}
