import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import {EXECUTOR_PROFILE_VERSION, selectExperimentExecutor} from '../src/server/experiment-executor.js';

const workload = {operation: 'scenario-batch', scenarioCount: 100, animalCount: 100, hours: 720};
const environment = {platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model};
const record = (backend, p95EndToEndMs, options = {}) => ({
  operation: workload.operation, scenarioCount: workload.scenarioCount, animalCount: workload.animalCount,
  hours: workload.hours, days: undefined, backend, concurrency: 1, p95EndToEndMs,
  peakRssBytes: 100_000_000, estimatedCostUsd: 0, status: 'measured', parity: 'passed', ...options,
});
const profile = records => ({version: EXECUTOR_PROFILE_VERSION, environment, records});
const measuredProfile = JSON.parse(readFileSync(new URL('../docs/performance/executor-profile-v2.json', import.meta.url), 'utf8'));

test('current measured profile chooses sequential for tiny work and parallel for a matching 1000-scenario batch', () => {
  const small = selectExperimentExecutor({profile: measuredProfile,
    workload: {operation: 'scenario-batch', scenarioCount: 10, animalCount: 3, hours: 24},
    maxCostUsd: 0, maxRssBytes: 500_000_000});
  const batch = selectExperimentExecutor({profile: measuredProfile,
    workload: {operation: 'scenario-batch', scenarioCount: 1000, animalCount: 3, hours: 24},
    maxCostUsd: 0, maxRssBytes: 500_000_000});
  assert.equal(small.backend, 'local-js');
  assert.equal(small.concurrency, 1);
  assert.equal(batch.backend, 'local-js');
  const exactHost = measuredProfile.environment.platform === process.platform
    && measuredProfile.environment.arch === process.arch
    && measuredProfile.environment.node === process.version
    && measuredProfile.environment.cpu === environment.cpu;
  assert.equal(batch.concurrency, exactHost ? 4 : 1);
});

test('automatic selection uses the fastest exact parity-passed measurement inside resource limits', () => {
  const choice = selectExperimentExecutor({profile: profile([
    record('local-js', 250, {concurrency: 1}),
    record('local-js', 100, {concurrency: 4}),
    record('local-rust', 70, {concurrency: 1}),
    record('modal-gpu', 25, {concurrency: 1, estimatedCostUsd: 0.02,
      coldStartP95Ms: 100, warmStartP95Ms: 5, totalLatencyP95Ms: 25}),
  ]), workload, maxCostUsd: 0, maxRssBytes: 200_000_000});
  assert.equal(choice.backend, 'local-rust');
  assert.equal(choice.concurrency, 1);
  assert.equal(choice.estimatedCostUsd, 0);
});

test('interactive workloads always stay local and remote candidates require explicit authorization and cost budget', () => {
  const cloud = record('modal-gpu', 25, {estimatedCostUsd: 0.02, coldStartP95Ms: 100,
    warmStartP95Ms: 5, totalLatencyP95Ms: 25});
  assert.equal(selectExperimentExecutor({profile: profile([cloud]), workload: {mode: 'interactive'}}).backend, 'local-js');
  assert.equal(selectExperimentExecutor({profile: profile([cloud]), workload, maxCostUsd: 1}).backend, 'local-js');
  const authorized = selectExperimentExecutor({profile: profile([cloud]), workload, maxCostUsd: 0.05,
    maxRssBytes: 200_000_000, cloudAuthorized: true});
  assert.equal(authorized.backend, 'modal-gpu');
  assert.equal(authorized.estimatedCostUsd, 0.02);
  assert.equal(selectExperimentExecutor({profile: profile([cloud]), workload, maxCostUsd: 0.01,
    cloudAuthorized: true}).backend, 'local-js');
});

test('automatic selection does not extrapolate to unknown workloads or mismatched hardware', () => {
  const local = record('local-rust', 70);
  const mismatched = profile([local]);
  mismatched.environment.arch = 'unknown-arch';
  assert.equal(selectExperimentExecutor({profile: mismatched, workload}).backend, 'local-js');
  assert.equal(selectExperimentExecutor({profile: profile([local]), workload: {...workload, scenarioCount: 10}}).backend, 'local-js');
  const failedParity = record('local-rust', 1, {parity: 'failed'});
  assert.equal(selectExperimentExecutor({profile: profile([failedParity]), workload}).backend, 'local-js');
});

test('automatic selection excludes a measured local backend when its executable is unavailable', () => {
  const selection = selectExperimentExecutor({profile: profile([record('local-rust', 1)]), workload, maxCostUsd: 0,
    maxRssBytes: 1_000_000_000, availableBackends: ['local-js']});
  assert.equal(selection.backend, 'local-js');
  assert.equal(selection.concurrency, 1);
});
