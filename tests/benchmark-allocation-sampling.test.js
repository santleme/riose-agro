import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleAllocations} from '../scripts/benchmark-allocation-sampling.mjs';

test('allocation sampling reports sampled sites without measuring operation time', async () => {
  let retained = [];
  const profile = await sampleAllocations(() => {
    retained = Array.from({length: 1_000}, (_, index) => ({index, value: `row-${index}`}));
  }, 40, 512);

  assert.equal(retained.length, 1_000);
  assert.equal(profile.method, 'v8-heap-profiler-sampling');
  assert.equal(profile.iterations, 40);
  assert.equal(profile.samplingIntervalBytes, 512);
  assert.ok(profile.allocationSampleCount > 0);
  assert.ok(profile.estimatedAllocatedBytes > 0);
  assert.ok(profile.topSites.some(site => site.estimatedAllocatedBytes > 0));
});

test('allocation sampler rejects invalid operations and sampling bounds', async () => {
  await assert.rejects(sampleAllocations(null, 1), /operation function/);
  await assert.rejects(sampleAllocations(() => {}, 0), /positive integer/);
  await assert.rejects(sampleAllocations(() => {}, 1, 128), /at least 512 bytes/);
});
