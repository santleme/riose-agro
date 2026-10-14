//! Experimental JSON ABI for exercising the full native scenario contract in
//! a browser. This is enabled only for the isolated scenario-WASM build.

use crate::{run_native_scenario, NativeScenarioRequest};
use core::ptr;

const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 256 * 1024 * 1024;

#[link(wasm_import_module = "env")]
unsafe extern "C" {
    fn riose_scenario_now_ms() -> f64;
}

fn now_ms() -> f64 {
    // SAFETY: the isolated browser adapter provides this monotonic clock import.
    unsafe { riose_scenario_now_ms() }
}

#[no_mangle]
pub extern "C" fn riose_scenario_abi_version() -> u32 {
    2
}

/// Allocates a byte buffer for a JSON request from JavaScript.
///
/// The pointer must be released with `riose_scenario_free_input` and the same
/// length. Zero-length and oversized requests return null.
#[no_mangle]
pub extern "C" fn riose_scenario_alloc_input(length: usize) -> *mut u8 {
    if length == 0 || length > MAX_REQUEST_BYTES {
        return ptr::null_mut();
    }
    Box::into_raw(vec![0_u8; length].into_boxed_slice()) as *mut u8
}

/// Releases an input buffer returned by `riose_scenario_alloc_input`.
///
/// # Safety
/// `pointer` must be an unreleased pointer from the matching allocator and
/// `length` must be exactly the allocation length.
#[no_mangle]
pub unsafe extern "C" fn riose_scenario_free_input(pointer: *mut u8, length: usize) {
    if !pointer.is_null() && length > 0 && length <= MAX_REQUEST_BYTES {
        // SAFETY: the exported ABI contract requires the exact allocator pair.
        let slice = ptr::slice_from_raw_parts_mut(pointer, length);
        drop(unsafe { Box::from_raw(slice) });
    }
}

/// Runs one strict `NativeScenarioRequest` and returns a packed output handle.
///
/// The low 32 bits contain a pointer to the allocated UTF-8 JSON response and
/// the high 32 bits contain its byte length. Zero indicates a failed ABI call.
/// The response contains the unchanged `NativeRunResult` under `result` and
/// stage timings under `timings`. Release it with
/// `riose_scenario_free_output(pointer, length)` after copying the bytes.
///
/// # Safety
/// `input` must point to `length` readable bytes from a live WebAssembly memory
/// allocation. The caller must keep that allocation alive for this call.
#[no_mangle]
pub unsafe extern "C" fn riose_scenario_run_json(input: *const u8, length: usize) -> u64 {
    if input.is_null() || length == 0 || length > MAX_REQUEST_BYTES {
        return 0;
    }
    // SAFETY: pointer validity and byte length are the caller's ABI contract.
    let request_bytes = unsafe { core::slice::from_raw_parts(input, length) };
    let parse_started = now_ms();
    let Ok(request) = serde_json::from_slice::<NativeScenarioRequest>(request_bytes) else {
        return 0;
    };
    let request_json_parse_ms = now_ms() - parse_started;

    let engine_started = now_ms();
    let Ok(result) = run_native_scenario(request) else {
        return 0;
    };
    let native_scenario_engine_ms = now_ms() - engine_started;

    let serialize_started = now_ms();
    let Ok(encoded) = serde_json::to_vec(&result) else {
        return 0;
    };
    let result_json_serialize_ms = now_ms() - serialize_started;
    if encoded.is_empty() || encoded.len() > MAX_RESPONSE_BYTES || encoded.len() > u32::MAX as usize
    {
        return 0;
    }

    let timings = serde_json::json!({
        "requestJsonParseMs": request_json_parse_ms,
        "nativeScenarioEngineMs": native_scenario_engine_ms,
        "resultJsonSerializeMs": result_json_serialize_ms,
    });
    let Ok(timings_json) = serde_json::to_vec(&timings) else {
        return 0;
    };
    const RESULT_PREFIX: &[u8] = b"{\"result\":";
    const TIMINGS_PREFIX: &[u8] = b",\"timings\":";
    let result_length = encoded.len();
    let Some(response_length) = result_length
        .checked_add(RESULT_PREFIX.len())
        .and_then(|length| length.checked_add(TIMINGS_PREFIX.len()))
        .and_then(|length| length.checked_add(timings_json.len()))
        .and_then(|length| length.checked_add(1))
    else {
        return 0;
    };
    if response_length > MAX_RESPONSE_BYTES || response_length > u32::MAX as usize {
        return 0;
    }
    let mut response = encoded;
    response.reserve(response_length - result_length);
    response.resize(response_length, 0);
    response.copy_within(0..result_length, RESULT_PREFIX.len());
    response[..RESULT_PREFIX.len()].copy_from_slice(RESULT_PREFIX);
    let timings_prefix_start = RESULT_PREFIX.len() + result_length;
    let timings_start = timings_prefix_start + TIMINGS_PREFIX.len();
    response[timings_prefix_start..timings_start].copy_from_slice(TIMINGS_PREFIX);
    response[timings_start..timings_start + timings_json.len()].copy_from_slice(&timings_json);
    response[response_length - 1] = b'}';
    let length = response_length as u32;
    let pointer = Box::into_raw(response.into_boxed_slice()) as *mut u8;
    ((length as u64) << 32) | (pointer as u32 as u64)
}

/// Releases a JSON output returned by `riose_scenario_run_json`.
///
/// # Safety
/// `pointer` and `length` must be the exact handle returned by one unreleased
/// successful `riose_scenario_run_json` call.
#[no_mangle]
pub unsafe extern "C" fn riose_scenario_free_output(pointer: *mut u8, length: usize) {
    if !pointer.is_null() && length > 0 && length <= MAX_RESPONSE_BYTES {
        // SAFETY: the exported ABI contract requires the exact returned pair.
        let slice = ptr::slice_from_raw_parts_mut(pointer, length);
        drop(unsafe { Box::from_raw(slice) });
    }
}
