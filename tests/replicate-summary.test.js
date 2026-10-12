import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeExperimentReplicates, summarizeReplicates} from '../experiments/replicate-summary.js';
import {createBatchExperimentManifest, createExperimentResultRecord, digestScenario, sha256Digest} from '../experiments/batch-manifest.js';

const record = (runId, status, supplement, weight) => ({
  runId, status,
  inputs: {supplement: {value: supplement, unit: 'kg/day'}},
  ...(weight === undefined ? {} : {outputs: {weight: {value: weight, unit: 'kg'}, gain: {value: weight - 400, unit: 'kg'}}}),
});

test('replicate summaries are order-independent and label spread as descriptive', () => {
  const records = [record('r3', 'completed', 1, 410), record('r1', 'completed', 1, 390), record('r2', 'completed', 1, 400)];
  const options = {groupBy: ['supplement']};
  const forward = summarizeReplicates(records, options);
  const reverse = summarizeReplicates([...records].reverse(), options);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward[0].outputs.weight, {
    unit: 'kg', missingRuns: 0,
    provenance: {includedRunIds: ['r1', 'r2', 'r3'], missingRunIds: []},
    n: 3, mean: 400, standardDeviation: 10,
    quantiles: {p05: 391, p25: 395, p50: 400, p75: 405, p95: 409},
    label: 'descriptive replicate variability; quantiles are not confidence intervals',
  });
  assert.deepEqual(forward[0].provenance, {
    runIds: ['r1', 'r2', 'r3'], completedRunIds: ['r1', 'r2', 'r3'], failedRunIds: [], incompleteRunIds: [],
  });
});

test('floating-point summaries are permutation-stable and use compensated accumulation', () => {
  const records = [1e16, 1, -1e16].map((value, index) => record(`r${index}`, 'completed', 1, value));
  const forward = summarizeReplicates(records, {groupBy: ['supplement']});
  const shuffled = summarizeReplicates([records[2], records[0], records[1]], {groupBy: ['supplement']});
  assert.deepEqual(forward, shuffled);
  assert.equal(forward[0].outputs.weight.mean, 1 / 3);
});

test('finite extreme outputs retain representable means, SDs, and quantiles', () => {
  const result = summarizeReplicates([
    record('large-a', 'completed', 1, 1e308),
    record('large-b', 'completed', 1, 1e308),
    record('negative', 'completed', 1, -1e308),
  ], {groupBy: ['supplement']})[0].outputs.weight;
  assert.equal(result.mean, 1e308 / 3);
  assert.ok(Math.abs(result.standardDeviation / (1e308 * Math.sqrt(4 / 3)) - 1) < 1e-15);
  assert.ok(Number.isFinite(result.quantiles.p50));
  assert.equal(result.quantiles.p50, 1e308);
  assert.ok(Number.isFinite(result.quantiles.p05));
});

test('statistics that exceed the finite numeric range fail explicitly', () => {
  assert.throws(() => summarizeReplicates([
    record('negative-max', 'completed', 1, -Number.MAX_VALUE),
    record('positive-max', 'completed', 1, Number.MAX_VALUE),
  ], {groupBy: ['supplement']})[0].outputs.weight.standardDeviation, /outside the finite numeric range/);
});

test('failed runs and completed runs missing an output remain visible in counts', () => {
  const result = summarizeReplicates([
    record('r1', 'completed', 1, 390), record('r2', 'completed', 1), record('r3', 'failed', 1),
  ], {groupBy: ['supplement'], outputs: ['weight', 'cost']})[0];
  assert.equal(result.completedRuns, 2);
  assert.equal(result.failedRuns, 1);
  assert.equal(result.outputs.weight.n, 1);
  assert.equal(result.outputs.weight.missingRuns, 1);
  assert.equal(result.outputs.cost.n, 0);
  assert.equal(result.outputs.cost.missingRuns, 2);
  assert.equal(result.outputs.cost.mean, null);
  assert.deepEqual(result.provenance, {
    runIds: ['r1', 'r2', 'r3'], completedRunIds: ['r1', 'r2'], failedRunIds: ['r3'], incompleteRunIds: [],
  });
  assert.deepEqual(result.outputs.weight.provenance, {includedRunIds: ['r1'], missingRunIds: ['r2']});
});

test('incompatible output units are rejected', () => {
  assert.throws(() => summarizeReplicates([
    record('r1', 'completed', 1, 390),
    {...record('r2', 'completed', 1, 400), outputs: {weight: {value: 400, unit: 'lb'}}},
  ]), /incompatible units/);
});

test('incomplete runs and invalid output envelopes are handled explicitly', () => {
  assert.equal(summarizeReplicates([{runId: 'r1', status: 'running'}])[0].incompleteRuns, 1);
  assert.throws(() => summarizeReplicates([{runId: 'r1', status: 'completed', outputs: {weight: {value: 2}}}], {outputs: ['weight']}), /value and unit/);
});

test('manifest linked summaries verify digests and aggregate only completed numeric outputs', () => {
  const outputs = {weight: {value: 400, unit: 'kg/animal'}, passed: {value: true, unit: 'boolean'}};
  const completed = {
    runId: 'done', scenarioId: 'done', scenarioDigest: digestScenario({scenarioId: 'done'}), seed: 1,
    engine: {id: 'engine', version: '1', buildDigest: sha256Digest('engine'), status: 'provided'},
    models: [], datasets: [], evidence: [], inputs: {system: {value: 'beef', unit: 'category'}},
    outputs, status: 'completed', outputDigest: sha256Digest(outputs), resultRef: 'results.jsonl#done',
  };
  const incomplete = {...completed, runId: 'pending', scenarioId: 'pending', scenarioDigest: digestScenario({scenarioId: 'pending'}), outputs: {}, status: 'planned', outputDigest: null, resultRef: null};
  const failed = {...incomplete, runId: 'failed', scenarioId: 'failed', scenarioDigest: digestScenario({scenarioId: 'failed'}), status: 'failed'};
  const manifest = createBatchExperimentManifest({experimentId: 'summary', runs: [completed, incomplete, failed]});
  const record = createExperimentResultRecord({runId: 'done', outputs});
  const summary = summarizeExperimentReplicates(manifest, [record], {groupBy: ['system']});
  assert.deepEqual(Object.keys(summary[0].outputs), ['weight']);
  assert.equal(summary[0].outputs.weight.mean, 400);
  assert.equal(summary[0].completedRuns, 1);
  assert.equal(summary[0].incompleteRuns, 1);
  assert.equal(summary[0].failedRuns, 1);
  assert.equal(summary[0].provenance.experimentId, 'summary');
  assert.equal(summary[0].provenance.manifestDigest, manifest.manifestDigest);
  assert.deepEqual(summary[0].provenance.resultRecordDigests, [{runId: 'done', outputDigest: record.outputDigest}]);
  assert.throws(() => summarizeExperimentReplicates(manifest, [{...record, outputDigest: sha256Digest({weight: {value: 1, unit: 'kg'}})}]), /Result digest mismatch/);
});

test('duplicate generic run identities are rejected to protect provenance', () => {
  assert.throws(() => summarizeReplicates([
    record('same', 'completed', 1, 390), record('same', 'failed', 1),
  ]), /Duplicate runId same/);
});
