import {FarmEngine, compare} from './engine.js';

let scenarioWasm;
let wasmStartup;

function runJavaScript(request) {
  if (request.type === 'baseline') {
    const engine = new FarmEngine(request.seed, request.animalCount);
    engine.configure(request.configuration);
    engine.tick(request.hours);
    return {result: {type: 'baseline', snapshot: engine.snapshot(), metrics: engine.metrics()}};
  }
  if (request.type === 'housing-comparison') {
    return {result: {type: 'housing-comparison', comparison: compare(request.snapshot, request.days)}};
  }
  throw new Error(`Unsupported benchmark scenario: ${request.type}`);
}

self.onmessage = async event => {
  const {id, action, request, wasmUrl} = event.data ?? {};
  if (action === 'init') {
    const started = performance.now();
    if (event.data.backend === 'javascript') {
      wasmStartup = {status: 'javascript-ready', elapsedMs: performance.now() - started};
      self.postMessage({id, ok: true, startup: wasmStartup});
      return;
    }
    try {
      const {loadNativeScenarioWasm} = await import('./native-scenario-wasm.js');
      scenarioWasm = await loadNativeScenarioWasm(wasmUrl ? new URL(wasmUrl, self.location.href) : undefined);
      wasmStartup = {status: 'ready', elapsedMs: performance.now() - started,
        memoryBytes: scenarioWasm.memoryBytes(), abiVersion: scenarioWasm.abiVersion};
      self.postMessage({id, ok: true, startup: wasmStartup});
    } catch (error) {
      wasmStartup = {status: 'unavailable', elapsedMs: performance.now() - started,
        reason: error?.message ?? 'scenario_wasm_load_failed'};
      self.postMessage({id, ok: false, startup: wasmStartup});
    }
    return;
  }
  if (action === 'run') {
    const backend = event.data.backend === 'wasm' && scenarioWasm ? 'wasm' : 'javascript';
    try {
      const started = performance.now();
      const output = backend === 'wasm' ? scenarioWasm(request) : runJavaScript(request);
      self.postMessage({id, ok: true, backend, elapsedMs: performance.now() - started,
        result: output.result, wasmMemoryBytes: backend === 'wasm' ? scenarioWasm.memoryBytes() : null,
        bridgeTimings: backend === 'wasm' ? scenarioWasm.lastTimings : null,
        fallback: event.data.backend === 'wasm' && backend !== 'wasm'
          ? {used: true, reason: wasmStartup?.reason ?? 'scenario_wasm_unavailable'}
          : {used: false}});
    } catch (error) {
      if (event.data.backend === 'wasm') {
        try {
          const started = performance.now();
          const output = runJavaScript(request);
          self.postMessage({id, ok: true, backend: 'javascript', elapsedMs: performance.now() - started,
            result: output.result, wasmMemoryBytes: null,
            fallback: {used: true, reason: error?.message ?? 'scenario_wasm_execution_failed'}});
          return;
        } catch (fallbackError) {
          self.postMessage({id, ok: false, error: fallbackError?.message ?? 'javascript_fallback_failed',
            wasmError: error?.message ?? 'scenario_wasm_execution_failed'});
          return;
        }
      }
      self.postMessage({id, ok: false, error: error?.message ?? 'javascript_scenario_failed'});
    }
  }
};
