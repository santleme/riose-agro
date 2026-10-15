import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeProfileUrl,sampleAllocations} from '../scripts/benchmarks/benchmark-allocation-sampling.mjs';

test('normalizes profiler file URLs to repository-relative paths without changing filter URLs',()=>{
  const repositoryRootUrl=new URL('../',import.meta.url);
  const sourceUrl=new URL('../scripts/benchmarks/benchmark-animal-layout.mjs',import.meta.url).href;
  assert.equal(normalizeProfileUrl(sourceUrl,repositoryRootUrl),'scripts/benchmarks/benchmark-animal-layout.mjs');
  assert.equal(normalizeProfileUrl(new URL('./outside.mjs',new URL('file:///tmp/')).href,repositoryRootUrl),'outside-repository:outside.mjs');
  assert.equal(normalizeProfileUrl(sourceUrl),'local-file:benchmark-animal-layout.mjs');
});

test('allocation sampling reports sampled sites without measuring operation time', async () => {
  let retained = [];
  const repositoryRootUrl=new URL('../',import.meta.url);
  const sourceUrl=import.meta.url;
  const profile = await sampleAllocations(() => {
    retained = Array.from({length: 1_000}, (_, index) => ({index, value: `row-${index}`}));
  }, 40, 512, sourceUrl, repositoryRootUrl);

  assert.equal(retained.length, 1_000);
  assert.equal(profile.method, 'v8-heap-profiler-sampling');
  assert.equal(profile.warmupIterations, 1_000);
  assert.equal(profile.iterations, 40);
  assert.equal(profile.samplingIntervalBytes, 512);
  assert.ok(profile.allocationSampleCount > 0);
  assert.ok(profile.estimatedAllocatedBytes > 0);
  assert.ok(profile.topSites.some(site => site.estimatedAllocatedBytes > 0));
  assert.ok(profile.topSites.every(site => site.url === 'tests/benchmark-allocation-sampling.test.js'));
  assert.ok(profile.topSites.every(site => !site.url.includes('file://') && !site.url.includes('/home/')));
});

test('allocation sampler rejects invalid operations and sampling bounds', async () => {
  await assert.rejects(sampleAllocations(null, 1), /operation function/);
  await assert.rejects(sampleAllocations(() => {}, 0), /positive integer/);
  await assert.rejects(sampleAllocations(() => {}, 1, 128), /at least 512 bytes/);
  await assert.rejects(sampleAllocations(() => {}, 1, 512, import.meta.url), /repository root URL/);
});
