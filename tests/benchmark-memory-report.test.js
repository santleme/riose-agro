import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(readFileSync(new URL('../docs/architecture/benchmark-report.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors: true, strict: false}).compile(schema);
const committedCapture = JSON.parse(readFileSync(new URL('../docs/evidence/memory-profile-issue90-2026-10-13.json', import.meta.url), 'utf8'));

function assertPeakProxy(run, phase, animalCount) {
  const memory = run[phase].memory;
  const peak = memory.bestAvailablePeakProxy;
  assert.ok(Number.isFinite(peak.processRssPeakObservedBytes) && peak.processRssPeakObservedBytes > 0);
  assert.ok(Number.isFinite(peak.processRssObservedPeakIncreaseBytes) && peak.processRssObservedPeakIncreaseBytes >= 0);
  assert.ok(Number.isInteger(peak.processRssSamples) && peak.processRssSamples > 0);
  assert.ok(Number.isFinite(peak.processRssPollIntervalMs) && peak.processRssPollIntervalMs >= 1);
  assert.ok(Number.isFinite(memory.postGcRetainedDelta.jsHeapUsedBytes));
  assert.ok(Number.isFinite(memory.postGcRetainedDelta.arrayBuffersBytes));
  assert.ok(Number.isFinite(run[phase].elapsedMs));
  assert.ok(Number.isInteger(animalCount) && animalCount > 0);
}

test('checked-in memory capture keeps FarmEngine peak, retained heap and payload evidence per run', () => {
  assert.equal(validate(committedCapture), true, JSON.stringify(validate.errors));
  assert.equal(committedCapture.configuration.repetitions, 5);
  assert.deepEqual(committedCapture.workload.populations.map(item => [item.animals, item.scope]), [
    [100, 'FarmEngine'], [1_000, 'FarmEngine'], [10_000, 'FarmEngine'], [100_000, 'numeric-kernel-only'],
  ]);

  const memorySamples = committedCapture.results.samples;
  for (const herd of memorySamples.filter(row => row.scope === 'FarmEngine')) {
    assert.equal(herd.runs.length, committedCapture.configuration.repetitions);
    for (const run of herd.runs) {
      for (const phase of ['startup', 'engine', 'snapshot', 'serialization']) {
        assertPeakProxy(run, phase, herd.animals);
      }
      assert.ok(run.worker, 'the archived report retains its historical Worker projection measurement');
      assert.ok(Number.isInteger(run.serialization.payloadBytes.jsonUtf8Bytes));
      assert.ok(Number.isInteger(run.serialization.payloadBytes.gzipBytes));
      assert.ok(Number.isInteger(run.worker.payloadBytes.transferableArrayBuffers));
    }
  }

  const enginePhase = committedCapture.phases.engine.measurements;
  for (const herd of memorySamples.filter(row => row.scope === 'FarmEngine')) {
    const metric = enginePhase.find(item => item.metric === 'processRssObservedPeakIncreaseDuringPhasePerAnimal'
      && item.population.count === herd.animals);
    const expected = herd.runs.map(run => run.engine.memory.bestAvailablePeakProxy.processRssObservedPeakIncreaseBytes / herd.animals);
    assert.deepEqual(metric.observations, expected);
    assert.equal(metric.unit, 'bytes/animal');
    assert.match(metric.source, /process-wide lower-bound proxy/);
  }

  const kernel = memorySamples.find(row => row.animals === 100_000);
  assert.equal(kernel.numericKernel.length, committedCapture.configuration.repetitions);
  for (const sample of kernel.numericKernel) {
    assertPeakProxy({wasm: sample.wasm}, 'wasm', kernel.animals);
    assertPeakProxy({javascript: sample.javascript}, 'javascript', kernel.animals);
  }
});

test('memory harness emits schema-valid repeated phase peak evidence for a small run', () => {
  const result = spawnSync(process.execPath, ['--expose-gc', 'scripts/benchmarks/benchmark-memory.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    timeout: 30_000,
    env: {...process.env, BENCH_MEMORY_HERDS: '100', BENCH_MEMORY_REPETITIONS: '2', BENCH_MEMORY_RSS_POLL_MS: '1'},
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const report = JSON.parse(result.stdout);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.configuration.repetitions, 2);
  const herd = report.results.samples[0];
  assert.equal(herd.runs.length, 2);
  for (const run of herd.runs) {
    for (const phase of ['startup', 'engine', 'snapshot', 'serialization']) {
      assertPeakProxy(run, phase, 100);
    }
    assert.equal(Object.hasOwn(run, 'worker'), false, 'current memory runs exclude the retired visual Worker projection');
  }
  const engineMetric = report.phases.engine.measurements.find(item => item.metric === 'processRssObservedPeakIncreaseDuringPhasePerAnimal');
  assert.deepEqual(engineMetric.observations, herd.runs.map(run => run.engine.memory.bestAvailablePeakProxy.processRssObservedPeakIncreaseBytes / 100));
  assert.equal(report.results.memoryFields.includes('gpuMemoryBytes'), true);
  assert.equal(report.hardware.gpuMemoryBytes, null);
  for (const [metric, memoryType] of [
    ['postGcRetainedExternalDelta', 'v8-external-memory'],
    ['postGcRetainedExternalDeltaPerAnimal', 'v8-external-memory'],
    ['postGcRetainedArrayBuffersDelta', 'arraybuffer-memory'],
    ['postGcRetainedArrayBuffersDeltaPerAnimal', 'arraybuffer-memory'],
  ]) {
    const measurement = Object.values(report.phases).flatMap(phase => phase.measurements).find(item => item.metric === metric);
    assert.equal(measurement?.memoryType, memoryType);
  }
});
