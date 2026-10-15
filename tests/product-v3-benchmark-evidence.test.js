import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertBenchmarkReport} from '../scripts/benchmarks/benchmark-report.mjs';

const readReport = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const scenarioLab = readReport('../docs/evidence/product-v3-scenario-lab-benchmark-2026-10.json');
const nativeWasm = readReport('../docs/evidence/product-v3-native-wasm-browser-benchmark-2026-10.json');

test('persisted Product V3 population profile is a valid clean-source report with repeated scale observations', () => {
  assertBenchmarkReport(scenarioLab);
  assert.equal(scenarioLab.benchmark.source.dirty, false);
  assert.equal(scenarioLab.configuration.repetitions, 3);
  assert.deepEqual(scenarioLab.workload.populations.map(population => population.animals), [100, 1000, 10000]);
  assert.equal(scenarioLab.workload.scenario.arms, 3);
  assert.equal(scenarioLab.phases.serialization.measurements.at(-1).statistics.median, 31_580_825);
  assert.equal(scenarioLab.phases.layout.measurements.find(item => item.metric === 'visibleAnimalGridCells' && item.population.animals === 10000).statistics.median, 1200);
});

test('persisted native browser evidence verifies both goldens and unavailable-WASM fallback', () => {
  assertBenchmarkReport(nativeWasm);
  assert.equal(nativeWasm.benchmark.source.dirty, false);
  assert.ok(Object.values(nativeWasm.results.goldenParity).every(Boolean));
  assert.equal(nativeWasm.results.fallback.verified, true);
});
