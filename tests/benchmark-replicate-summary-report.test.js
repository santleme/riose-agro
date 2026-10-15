import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assertBenchmarkReport} from '../scripts/benchmark-report.mjs';

test('replicate summary benchmark preserves raw timing and process-heap observations', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'riose-replicate-benchmark-'));
  const reportPath = join(tempDirectory, 'report.json');
  try {
    const result = spawnSync(process.execPath, ['scripts/experiments/benchmark-replicate-summary.mjs', '--output', reportPath], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assertBenchmarkReport(report);
    assert.equal(report.results.length, 3);
    for (const row of report.results) {
      assert.equal(row.runtimeObservationsMs.length, 7);
      assert.equal(row.summarizeMs.sampleCount, 7);
      assert.equal(typeof row.summarizeMs.median, 'number');
    }

    const runtime = report.phases.layout.measurements.find(item => item.metric === 'summary_runtime');
    assert.equal(runtime.observations.length, 21);
    assert.equal(runtime.statistics.sampleCount, 21);
    assert.match(runtime.source, /performance\.now/);

    const heap = report.phases.layout.measurements.find(item => item.metric === 'process_heap_used_after_aggregation');
    assert.equal(heap.observations.length, 3);
    assert.match(heap.population, /process-level/);
    assert.match(heap.source, /process\.memoryUsage/);
    const sortedHeapObservations = [...heap.observations].sort((left, right) => left - right);
    assert.deepEqual(heap.statistics.values, heap.observations);
    assert.equal(heap.statistics.median, sortedHeapObservations[1]);
    assert.deepEqual(heap.statistics.spread, {
      min: sortedHeapObservations[0],
      max: sortedHeapObservations.at(-1),
      range: sortedHeapObservations.at(-1) - sortedHeapObservations[0],
    });
  } finally {
    await rm(tempDirectory, {recursive: true, force: true});
  }
});
