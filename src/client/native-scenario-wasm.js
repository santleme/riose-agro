const MAX_REQUEST_JSON_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_JSON_BYTES = 256 * 1024 * 1024;

function exportsMatch(exports) {
  return exports.memory instanceof WebAssembly.Memory
    && typeof exports.riose_scenario_abi_version === 'function'
    && exports.riose_scenario_abi_version() === 2
    && typeof exports.riose_scenario_alloc_input === 'function'
    && typeof exports.riose_scenario_free_input === 'function'
    && typeof exports.riose_scenario_run_json === 'function'
    && typeof exports.riose_scenario_free_output === 'function';
}

async function instantiate(response) {
  const imports = {env: {riose_scenario_now_ms: () => performance.now()}};
  if (typeof WebAssembly.instantiateStreaming === 'function'
      && response.headers.get('content-type')?.includes('application/wasm')) {
    return WebAssembly.instantiateStreaming(response, imports);
  }
  const bytes = await response.arrayBuffer();
  return WebAssembly.instantiate(bytes, imports);
}

/** Load the isolated full-core WASM build used by browser research benchmarks. */
export async function loadNativeScenarioWasm(
  url = new URL('../../wasm/riose_scenario_core.wasm', import.meta.url),
  fetchImpl = fetch,
) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Scenario WASM fetch failed: ${response.status}`);
  let loaded;
  try {
    loaded = await instantiate(response);
  } catch (cause) {
    throw new Error('Scenario WASM module could not be instantiated', {cause});
  }
  const instance = loaded.instance;
  const {memory} = instance.exports;
  if (!exportsMatch(instance.exports)) {
    throw new Error('Scenario WASM exports do not match riose-core scenario ABI');
  }

  const run = request => {
    const timings = {};
    let started = performance.now();
    const inputBytes = new TextEncoder().encode(JSON.stringify(request));
    timings.requestJsonEncodeMs = performance.now() - started;
    if (inputBytes.length === 0 || inputBytes.length > MAX_REQUEST_JSON_BYTES) {
      throw new RangeError('Scenario WASM request exceeds its JSON byte limit');
    }
    started = performance.now();
    const inputPointer = instance.exports.riose_scenario_alloc_input(inputBytes.length);
    timings.inputAllocateMs = performance.now() - started;
    if (!Number.isInteger(inputPointer) || inputPointer <= 0
        || inputPointer + inputBytes.length > memory.buffer.byteLength) {
      throw new Error('Scenario WASM could not allocate request memory');
    }
    let outputPointer = 0;
    let outputLength = 0;
    try {
      started = performance.now();
      new Uint8Array(memory.buffer, inputPointer, inputBytes.length).set(inputBytes);
      timings.inputCopyMs = performance.now() - started;
      started = performance.now();
      const handle = instance.exports.riose_scenario_run_json(inputPointer, inputBytes.length);
      timings.coreAndJsonAbiMs = performance.now() - started;
      if (typeof handle !== 'bigint' || handle === 0n) {
        throw new Error('Scenario WASM rejected the request or could not serialize its result');
      }
      outputPointer = Number(handle & 0xffff_ffffn);
      outputLength = Number(handle >> 32n);
      if (!Number.isSafeInteger(outputLength) || outputLength <= 0
          || outputLength > MAX_RESPONSE_JSON_BYTES
          || !Number.isSafeInteger(outputPointer) || outputPointer <= 0
          || outputPointer + outputLength > memory.buffer.byteLength) {
        outputPointer = 0;
        outputLength = 0;
        throw new Error('Scenario WASM returned an invalid JSON memory handle');
      }
      started = performance.now();
      const outputBytes = new Uint8Array(memory.buffer, outputPointer, outputLength).slice();
      timings.outputCopyMs = performance.now() - started;
      started = performance.now();
      const response = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(outputBytes));
      timings.responseJsonDecodeMs = performance.now() - started;
      if (!response || typeof response !== 'object' || !response.result
          || !response.timings || typeof response.timings !== 'object'
          || !Number.isFinite(response.timings.requestJsonParseMs)
          || !Number.isFinite(response.timings.nativeScenarioEngineMs)
          || !Number.isFinite(response.timings.resultJsonSerializeMs)) {
        throw new Error('Scenario WASM returned an invalid response envelope');
      }
      Object.assign(timings, response.timings);
      run.lastTimings = timings;
      return response.result;
    } finally {
      if (outputPointer && outputLength) {
        instance.exports.riose_scenario_free_output(outputPointer, outputLength);
      }
      instance.exports.riose_scenario_free_input(inputPointer, inputBytes.length);
    }
  };

  run.memoryBytes = () => memory.buffer.byteLength;
  run.abiVersion = 2;
  run.lastTimings = null;
  return run;
}
