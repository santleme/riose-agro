import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {assertBenchmarkReport} from '../scripts/benchmark-report.mjs';

test('resumable journal benchmark retains raw heap samples and summarizes them for a small workload', () => {
  const result = spawnSync(process.execPath, ['scripts/benchmark-resumable-journal.mjs', '--run-count', '2', '--repetitions', '2'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const report = JSON.parse(result.stdout);
  assertBenchmarkReport(report);
  assert.equal(report.configuration.repetitions, 2);
  assert.equal(report.results.length, 2);
  for (const row of report.results) {
    assert.equal(row.heapUsedBytes.length, 2);
    assert.equal(row.heapUsedStatistics.sampleCount, 2);
    assert.equal(row.heapUsedStatistics.median, (Math.min(...row.heapUsedBytes) + Math.max(...row.heapUsedBytes)) / 2);
    assert.equal(row.heapUsedMaximumBytes, Math.max(...row.heapUsedBytes));
  }

  const heap = report.phases.layout.measurements.find(item => item.metric === 'heap_used_after_batch');
  const rawSamples = report.results.flatMap(row => row.heapUsedBytes);
  assert.deepEqual(heap.statistics.values, rawSamples);
  assert.equal(heap.statistics.sampleCount, rawSamples.length);
  const sortedSamples = [...rawSamples].sort((a, b) => a - b);
  assert.equal(heap.statistics.median, (sortedSamples[1] + sortedSamples[2]) / 2);
  assert.equal(heap.statistics.maximum, Math.max(...rawSamples));
  assert.deepEqual(heap.observations, rawSamples);
});
