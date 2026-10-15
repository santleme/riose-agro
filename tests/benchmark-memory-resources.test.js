import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {cleanupMemoryBenchmarkResources} from '../scripts/benchmarks/benchmark-memory-resources.mjs';

const memoryHarness = readFileSync(new URL('../scripts/benchmarks/benchmark-memory.mjs', import.meta.url), 'utf8');

test('memory harness cleanup disposes WASM allocations and detaches owned view buffers', () => {
  let disposed = false;
  const wasm = {dispose() { disposed = true; }};
  const ids = new Uint32Array(4);
  const values = new Float64Array(8);
  const actions = new Uint8Array(4);

  const cleanup = cleanupMemoryBenchmarkResources({wasm, views: [ids, values, actions]});

  assert.equal(disposed, true);
  assert.equal(cleanup.wasmDisposed, true);
  assert.equal(cleanup.detachedArrayBuffers, 3);
  assert.equal(ids.byteLength, 0);
  assert.equal(values.byteLength, 0);
  assert.equal(actions.byteLength, 0);
});

test('memory harness cleanup deduplicates shared views and tolerates no Browser Page resource', () => {
  const backing = new ArrayBuffer(64);
  const firstView = new Uint8Array(backing, 0, 16);
  const secondView = new Float64Array(backing, 16, 4);

  const cleanup = cleanupMemoryBenchmarkResources({views: [firstView, secondView]});

  assert.equal(cleanup.wasmDisposed, false);
  assert.equal(cleanup.detachedArrayBuffers, 1);
  assert.equal(firstView.byteLength, 0);
  assert.equal(secondView.byteLength, 0);
  assert.match(memoryHarness, /creates no Browser Page; browser page creation and cleanup are unavailable/);
});
