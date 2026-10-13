import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

test('format study round-trips the batch manifest/result contract with units and provenance', () => {
  const execution = spawnSync(process.execPath, ['--expose-gc', 'scripts/research_experiment_format.mjs'], {
    encoding: 'utf8',
    env: {...process.env, FORMAT_STUDY_RECORDS: '3', FORMAT_STUDY_REPETITIONS: '3'},
  });
  assert.equal(execution.status, 0, execution.stderr);
  const report = JSON.parse(execution.stdout);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.benchmark.name, 'json-jsonl-parquet-experiment-output-format-study');
  assert.match(report.benchmark.source.revision, /^[a-f0-9]{40}$/);
  assert.equal(typeof report.benchmark.source.dirty, 'boolean');
  assert.equal(report.workload.seed, '417-419 (per-record deterministic seed range)');
  assert.equal(report.workload.populations[0].count, 3);
  assert.equal(report.workload.populations[1].animals, 100);
  assert.equal(report.configuration.repetitions, 3);
  assert.deepEqual(report.configuration.warmupRuns, {write: 1, fullRead: 1, selectiveMetricRead: 0});
  assert.equal(report.results.workload.records, 3);
  assert.equal(report.results.workload.exactNormalizedRoundTrip, true);
  assert.equal(report.results.workload.comparedRecordShape, 'batch manifest run joined to riose-experiment-result v1 by runId');
  assert.ok(report.results.workload.roundTripCoverage.includes('unit-tagged inputs and outputs'));
  assert.ok(report.results.workload.roundTripCoverage.includes('null dataset/evidence provenance'));
  assert.ok(report.results.workload.batchManifestDigest.startsWith('sha256:'));
  assert.equal(report.timingBoundaries.length, 3);
  assert.ok(report.phases.serialization.measurements.length > 0);
  for (const format of ['json', 'jsonl']) {
    const detail = report.results.measurements[format];
    assert.ok(detail.bytes > 0);
    for (const operation of ['write', 'fullRead', 'selectiveMetricRead']) {
      assert.equal(detail[operation].durationsMs.length, 3);
      assert.equal(detail[operation].processMemorySamples.length, 3);
      const phaseMetric = report.phases.serialization.measurements.find(item => item.metric === `${format}-${operation === 'fullRead' ? 'full-read' : operation === 'selectiveMetricRead' ? 'selective-read' : 'write'}-duration`);
      assert.ok(phaseMetric);
      assert.equal(phaseMetric.statistics.rawObservations.length, 3);
      const memoryMetric = report.phases.serialization.measurements.find(item => item.metric === `${format}-${operation === 'fullRead' ? 'full-read' : operation === 'selectiveMetricRead' ? 'selective-read' : 'write'}-heapUsedBytes-delta`);
      assert.equal(memoryMetric.statistics.rawObservations.length, 3);
    }
    for (const suffix of ['uncompressed-size', 'gzip-level-6-size']) {
      const sizeMetric = report.phases.serialization.measurements.find(item => item.metric === `${format}-${suffix}`);
      assert.equal(sizeMetric.statistics.rawObservations.length, 1);
    }
  }
  const pythonFormatPackageNames = ['pyarrow', 'fastparquet', 'duckdb', 'polars'];
  const pythonPackages = pythonFormatPackageNames.map(name => report.results.toolchain[name === 'duckdb' ? 'pythonDuckdb' : name === 'polars' ? 'pythonPolars' : name]);
  const nodeFormatPackages = Object.values(report.results.toolchain.nodePackages);
  const parquetAvailable = pythonPackages[0].available;
  assert.equal(report.results.toolchain.parquetEnginesAvailable, parquetAvailable || nodeFormatPackages.some(pkg => pkg.available));
  assert.equal(report.results.toolchain.parquetMeasurement, parquetAvailable ? 'pyarrow-measured' : 'skipped-no-pyarrow-installed');
  if (parquetAvailable) {
    const parquet = report.results.toolchain.parquetPrototype;
    assert.equal(parquet.roundTrip.exactNormalized, true);
    assert.equal(parquet.selectiveRead.exactProjection, true);
    assert.ok(parquet.bytes > 0);
    assert.ok(parquet.installedPackageBytes > parquet.bytes);
    assert.equal(parquet.write.durationsMs.length, 3);
    assert.equal(parquet.fullRead.durationsMs.length, 3);
    assert.equal(parquet.selectiveMetricRead.durationsMs.length, 3);
  } else {
    assert.equal(report.results.toolchain.parquetPrototype, null);
  }
  for (const packageInfo of pythonPackages) {
    assert.equal(packageInfo.available, Boolean(packageInfo.version));
    assert.equal(packageInfo.available, packageInfo.installedPackageBytes !== null);
  }
  for (const packageInfo of nodeFormatPackages) {
    assert.equal(packageInfo.available, typeof packageInfo.resolvedEntry === 'string');
  }
  assert.equal(report.runtime.nodeParquetPackagesAvailable, nodeFormatPackages.some(pkg => pkg.available));
});
