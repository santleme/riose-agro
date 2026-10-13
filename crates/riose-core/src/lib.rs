//! Small deterministic numerical kernels shared by native and WebAssembly builds.

mod contract;
mod environment;
mod feeding;
mod runtime;
mod simulation;
mod snapshot;
mod state;
pub use contract::{
    run_native_scenario, EngineMetadata, NativeRunResult, NativeScenarioRequest,
    NativeScenarioResult, MODEL_STATUS, NATIVE_ENGINE_VERSION, NATIVE_SCENARIO_VERSION,
};
pub use environment::{environmental_stress, weather_rules, Weather, WeatherRules};
pub use feeding::{calculate_feeding, FeedingResult};
pub use runtime::*;
pub use simulation::{
    compare_housing, metrics, ComparisonRow, FarmEngine, HousingComparison, ModelAssumptions,
};
pub use snapshot::{decode_farm_snapshot, encode_farm_snapshot, FarmSnapshotDecodeError};
pub use state::{
    Activity, ActivityReason, ActivityRecord, AnimalState, Diet, FarmConfig, FarmEvent,
    FarmMetrics, FarmSnapshot, Housing, IntakeMetrics, IntakeTotals, ObservedActivityState,
    DAILY_PASTURE_GROWTH_KG_DM, INITIAL_PASTURE_KG_DM, PASTURE_CAP_KG_DM,
};

pub const MAX_BATCH: usize = 100_000;
pub const MAINTENANCE_KG_DM: f64 = 5.3;
pub const GAIN_FACTOR: f64 = 0.22;

/// Version of the packed metabolism batch ABI.
#[no_mangle]
pub extern "C" fn riose_abi_version() -> u32 {
    1
}

/// Updates each animal's weight and energy from its weight, energy intake and
/// resting flag. The output is interleaved `[weight, energy, ...]`.
pub fn update_metabolism(input: &[f64], output: &mut [f64]) -> Result<(), &'static str> {
    if input.len() % 4 != 0 {
        return Err("input length must be divisible by four");
    }
    let count = input.len() / 4;
    if count > MAX_BATCH {
        return Err("batch exceeds maximum size");
    }
    if output.len() != count * 2 {
        return Err("output length must be twice the animal count");
    }

    for (index, animal) in input.chunks_exact(4).enumerate() {
        let weight = animal[0];
        let energy = animal[1];
        let intake = animal[2];
        let resting = animal[3] != 0.0;
        let gain = (intake - MAINTENANCE_KG_DM * (weight / 360.0) / 24.0) * GAIN_FACTOR;
        output[index * 2] = (weight + gain).max(200.0);
        output[index * 2 + 1] =
            (energy + if resting { 5.0 } else { intake * 4.0 - 1.5 }).clamp(0.0, 100.0);
    }
    Ok(())
}

/// Allocates `f64` slots for callers using the raw C ABI.
///
/// # Safety
/// The returned pointer must be released once with `riose_free_f64` and the
/// same element count.
#[no_mangle]
pub extern "C" fn riose_alloc_f64(len: usize) -> *mut f64 {
    if len == 0 || len > MAX_BATCH * 4 {
        return core::ptr::null_mut();
    }
    let mut buffer = Vec::<f64>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    core::mem::forget(buffer);
    pointer
}

/// Releases a buffer returned by `riose_alloc_f64`.
///
/// # Safety
/// `pointer` must have been returned by `riose_alloc_f64(len)` and not yet
/// released. No other references to its allocation may be used afterward.
#[no_mangle]
pub unsafe extern "C" fn riose_free_f64(pointer: *mut f64, len: usize) {
    if !pointer.is_null() && len > 0 && len <= MAX_BATCH * 4 {
        // SAFETY: upheld by this function's documented caller contract.
        drop(Vec::from_raw_parts(pointer, 0, len));
    }
}

/// Applies the metabolism update to a packed batch.
///
/// Input contains four `f64` values per animal: weight, energy, intake and a
/// resting flag. Output contains two `f64` values per animal: new weight and
/// new energy. Returns zero on success and a negative status for invalid input.
///
/// # Safety
/// Input and output must each be valid, initialized allocations of `count * 4`
/// and `count * 2` f64 elements respectively, must not overlap, and remain
/// valid for this call. `count` must not exceed `MAX_BATCH`.
#[no_mangle]
pub unsafe extern "C" fn riose_update_metabolism_batch(
    count: usize,
    input: *const f64,
    output: *mut f64,
) -> i32 {
    if count > MAX_BATCH {
        return -1;
    }
    if count == 0 {
        return 0;
    }
    if input.is_null() || output.is_null() {
        return -2;
    }

    // SAFETY: buffer lengths, validity and non-overlap are part of the ABI contract.
    let input = unsafe { core::slice::from_raw_parts(input, count * 4) };
    // SAFETY: output allocation length is part of the ABI contract.
    let output = unsafe { core::slice::from_raw_parts_mut(output, count * 2) };
    match update_metabolism(input, output) {
        Ok(()) => 0,
        Err(_) => -3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updates_weight_and_energy_for_a_batch() {
        let input = [360.0, 75.0, 0.4, 0.0, 190.0, 99.0, 0.0, 1.0];
        let mut output = [0.0; 4];
        update_metabolism(&input, &mut output).unwrap();
        assert!((output[0] - (360.0 + (0.4 - 5.3 / 24.0) * 0.22)).abs() < 1e-12);
        assert_eq!(output[1], 75.1);
        assert_eq!(output[2], 200.0);
        assert_eq!(output[3], 100.0);
    }

    #[test]
    fn rejects_malformed_buffers() {
        assert!(update_metabolism(&[1.0, 2.0], &mut []).is_err());
        assert!(update_metabolism(&[1.0, 2.0, 3.0, 0.0], &mut [0.0]).is_err());
    }

    #[test]
    fn exports_the_documented_batch_abi_version() {
        assert_eq!(riose_abi_version(), 1);
    }
}
