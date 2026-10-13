import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createExecutorProfile} from '../scripts/create-executor-profile.mjs';
import {selectExperimentExecutor} from '../src/server/experiment-executor.js';

function report() {
  return {
    format: 'riose-scenario-scheduler-benchmark-v2',
    benchmark: {name: 'scenario-scheduler-concurrency', source: {revision: 'a'.repeat(40), dirty: false}},
    runtime: {platform: process.platform, node: process.version},
    hardware: {architecture: process.arch, cpu: os.cpus()[0].model},
    results: {workload: {scenarios: 10, hours: 24}, rows: [
      {scenarioCount: 10, concurrency: 1, sampleCount: 5, allPassed: true,
        p95EndToEndMs: 130, p95PeakObservedRssBytes: 80_000_000},
      {scenarioCount: 10, concurrency: 2, sampleCount: 5, allPassed: true,
        p95EndToEndMs: 80, p95PeakObservedRssBytes: 100_000_000},
    ]},
  };
}

test('clean scheduler evidence becomes an exact-workload executor profile', () => {
  const profile = createExecutorProfile(report(), 'scheduler.json');
  const selected = selectExperimentExecutor({profile,
    workload: {operation: 'scenario-batch', scenarioCount: 10, animalCount: 3, hours: 24},
    maxCostUsd: 0, maxRssBytes: 120_000_000});
  assert.equal(profile.records.length, 2);
  assert.equal(selected.backend, 'local-js');
  assert.equal(selected.concurrency, 2);
  assert.equal(selected.p95EndToEndMs, 80);
});

test('scheduler evidence with failed parity, missing memory, or dirty source cannot be profiled', () => {
  assert.throws(() => createExecutorProfile({...report(), benchmark: {name: 'scenario-scheduler-concurrency',
    source: {revision: 'a'.repeat(40), dirty: true}}}), /clean source revision/);
  const failed = report();
  failed.results.rows[0].allPassed = false;
  assert.throws(() => createExecutorProfile(failed), /every profile row/);
});
