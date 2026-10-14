import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadNativeScenarioWasm} from '../src/client/native-scenario-wasm.js';

const wasmBytes = await readFile(new URL('../wasm/riose_scenario_core.wasm', import.meta.url));
const baselineGolden = JSON.parse(await readFile(
  new URL('./scenario-goldens/baseline-pasture.json', import.meta.url), 'utf8'));
const housingGolden = JSON.parse(await readFile(
  new URL('./scenario-goldens/housing-comparison.json', import.meta.url), 'utf8'));

async function loadFixtureWasm(bytes = wasmBytes) {
  return loadNativeScenarioWasm('http://riose.test/riose_scenario_core.wasm', async () =>
    new Response(bytes, {headers: {'content-type': 'application/wasm'}}));
}

function assertSeparatedStageTimings(run) {
  assert.equal(run.abiVersion, 2);
  for (const field of ['requestJsonParseMs', 'nativeScenarioEngineMs', 'resultJsonSerializeMs']) {
    assert.ok(Number.isFinite(run.lastTimings[field]), `${field} should be reported by the Rust ABI`);
    assert.ok(run.lastTimings[field] >= 0, `${field} should not be negative`);
  }
}

test('full-core WASM replays the official baseline fixture exactly', async t => {
  const run = await loadFixtureWasm();
  t.after(() => run.dispose?.());
  const result = run({
    type: 'baseline',
    version: 1,
    seed: baselineGolden.seed,
    animalCount: baselineGolden.animalCount,
    configuration: baselineGolden.configuration,
    hours: baselineGolden.horizon.value,
  });
  assertSeparatedStageTimings(run);
  assert.equal(result.engine.provenance, 'native-rust-core');
  assert.deepEqual(result.result, {
    type: 'baseline',
    snapshot: baselineGolden.output.state,
    metrics: baselineGolden.output.metrics,
  });
});

test('full-core WASM replays the official housing comparison fixture exactly', async t => {
  const run = await loadFixtureWasm();
  t.after(() => run.dispose?.());
  const result = run({
    type: 'housing-comparison',
    version: 1,
    snapshot: housingGolden.replayManifest.baseline,
    days: housingGolden.horizon.value,
  });
  assertSeparatedStageTimings(run);
  assert.equal(result.engine.provenance, 'native-rust-core');
  assert.deepEqual(result.result, {
    type: 'housing-comparison',
    comparison: housingGolden.output,
  });
});

test('invalid scenario WASM reports load failure so a caller can use the JS fallback', async () => {
  await assert.rejects(loadFixtureWasm(new Uint8Array([0, 1, 2, 3])), /could not be instantiated/);
});

test('worker falls back to JavaScript when the scenario WASM is unavailable', async t => {
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  const replies = [];
  globalThis.self = {postMessage: reply => replies.push(reply)};
  globalThis.fetch = async () => new Response('missing', {status: 503});
  t.after(() => {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
  });

  await import(`../src/client/native-scenario-wasm-bench-worker.js?fallback-test=${Date.now()}`);
  await globalThis.self.onmessage({data: {id: 1, action: 'init'}});
  assert.equal(replies[0].ok, false);
  await globalThis.self.onmessage({data: {
    id: 2,
    action: 'run',
    backend: 'wasm',
    request: {
      type: 'baseline', version: 1, seed: 417, animalCount: 3,
      configuration: baselineGolden.configuration, hours: 24,
    },
  }});
  assert.equal(replies[1].ok, true);
  assert.equal(replies[1].backend, 'javascript');
  assert.equal(replies[1].fallback.used, true);
  assert.equal(replies[1].result.snapshot.hour, baselineGolden.output.state.hour);
});

test('worker falls back to JavaScript when the scenario WASM is invalid', async t => {
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  const replies = [];
  globalThis.self = {postMessage: reply => replies.push(reply)};
  globalThis.fetch = async () => new Response(new Uint8Array([0, 1, 2, 3]), {
    status: 200,
    headers: {'content-type': 'application/wasm'},
  });
  t.after(() => {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
  });

  await import(`../src/client/native-scenario-wasm-bench-worker.js?invalid-fallback-test=${Date.now()}`);
  await globalThis.self.onmessage({data: {id: 1, action: 'init'}});
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].startup.reason, /could not be instantiated/);
  await globalThis.self.onmessage({data: {
    id: 2,
    action: 'run',
    backend: 'wasm',
    request: {
      type: 'baseline', version: 1, seed: 417, animalCount: 3,
      configuration: baselineGolden.configuration, hours: 24,
    },
  }});
  assert.equal(replies[1].ok, true);
  assert.equal(replies[1].backend, 'javascript');
  assert.equal(replies[1].fallback.used, true);
  assert.match(replies[1].fallback.reason, /could not be instantiated/);
  assert.equal(replies[1].result.snapshot.hour, baselineGolden.output.state.hour);
});

test('worker falls back to JavaScript when the scenario WASM ABI is incompatible', async t => {
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
  const replies = [];
  globalThis.self = {postMessage: reply => replies.push(reply)};
  globalThis.fetch = async () => new Response(new Uint8Array([0, 97, 115, 109]), {
    status: 200,
    headers: {'content-type': 'application/wasm'},
  });
  WebAssembly.instantiateStreaming = async () => ({
    instance: {exports: {
      memory: new WebAssembly.Memory({initial: 1}),
      riose_scenario_abi_version: () => 999,
    }},
  });
  t.after(() => {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
    WebAssembly.instantiateStreaming = originalInstantiateStreaming;
  });

  await import(`../src/client/native-scenario-wasm-bench-worker.js?abi-fallback-test=${Date.now()}`);
  await globalThis.self.onmessage({data: {id: 1, action: 'init'}});
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].startup.reason, /exports do not match/);
  await globalThis.self.onmessage({data: {
    id: 2,
    action: 'run',
    backend: 'wasm',
    request: {
      type: 'baseline', version: 1, seed: 417, animalCount: 3,
      configuration: baselineGolden.configuration, hours: 24,
    },
  }});
  assert.equal(replies[1].ok, true);
  assert.equal(replies[1].backend, 'javascript');
  assert.equal(replies[1].fallback.used, true);
  assert.match(replies[1].fallback.reason, /exports do not match/);
  assert.equal(replies[1].result.snapshot.hour, baselineGolden.output.state.hour);
});
