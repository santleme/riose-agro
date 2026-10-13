import {performance} from 'node:perf_hooks';
import {createBatchExperimentManifest, createExperimentResultRecord, digestResultRecordBytes, digestScenario, serializeExperimentResultJsonl} from '../experiments/batch-manifest.js';

const runCount = Number.parseInt(process.env.RIOSE_EXPERIMENT_RUNS ?? '100', 10);
const repetitions = Number.parseInt(process.env.RIOSE_EXPERIMENT_REPETITIONS ?? '7', 10);
if (!Number.isInteger(runCount) || runCount < 1 || runCount > 10000) throw new Error('RIOSE_EXPERIMENT_RUNS must be an integer between 1 and 10000');
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('RIOSE_EXPERIMENT_REPETITIONS must be an integer between 1 and 100');

const results = [];
let manifest;
let resultRecords;
for (let index = 0; index < runCount; index++) {
  const scenario = {type: 'agroville-comparison', version: 1, scenarioId: `scenario-${index % 10}`, durationDays: 30};
  const outputs = {
    averageWeightKg: {value: 300 + index / 10, unit: 'kg/animal'},
    dryMatterIntakeKg: {value: 8 + index / 100, unit: 'kg DM/animal/day'},
    costBrl: {value: 1200 + index, unit: 'BRL/animal'}
  };
  results.push({
    runId: `run-${String(index + 1).padStart(6, '0')}`, scenarioFormat: 'riose-scenario-harness', scenarioVersion: 1, scenarioId: scenario.scenarioId, scenarioRef: `scenarios/${scenario.scenarioId}.json`,
    scenarioDigest: digestScenario(scenario), seed: index,
    engine: {id: 'agroville-comparison', version: 'v1', buildDigest: null, status: 'provided'},
    models: [], datasets: [{id: null, digest: null, uri: null, status: 'missing'}], evidence: [{id: null, digest: null, uri: null, status: 'missing'}],
    inputs: {initialWeight: {value: 300, unit: 'kg/animal'}}, outputs, status: 'completed',
    outputDigest: null, resultDigest: null, resultRef: `results.jsonl#run-${String(index + 1).padStart(6, '0')}`
  });
}
// Derive the declared output digests from each complete output record.
const outputRecords = results.map(run => createExperimentResultRecord({runId: run.runId, outputs: run.outputs}));
for (let index = 0; index < results.length; index++) {
  results[index].outputDigest = outputRecords[index].outputDigest;
  results[index].resultDigest = digestResultRecordBytes(JSON.stringify(outputRecords[index]));
}

function sample(fn) {
  const start = performance.now();
  fn();
  return Number((performance.now() - start).toFixed(3));
}
const manifestBuildMs = [];
const serializeManifestMs = [];
const serializeResultsMs = [];
for (let repetition = 0; repetition < repetitions; repetition++) {
  manifestBuildMs.push(sample(() => { manifest = createBatchExperimentManifest({experimentId: 'benchmark-batch', createdAt: '2026-10-12T00:00:00.000Z', runs: results}); }));
  serializeManifestMs.push(sample(() => JSON.stringify(manifest)));
  serializeResultsMs.push(sample(() => { resultRecords = serializeExperimentResultJsonl(outputRecords); }));
}
const manifestText = JSON.stringify(manifest);
const resultText = resultRecords;
const report = {
  schemaVersion: 'riose.batch-manifest-benchmark/v1',
  workload: {runs: runCount, repetitions, simulationIncluded: false},
  bytes: {manifestUtf8: Buffer.byteLength(manifestText), resultsJsonlUtf8: Buffer.byteLength(resultText), combinedUtf8: Buffer.byteLength(manifestText) + Buffer.byteLength(resultText)},
  serializationMilliseconds: {manifestBuildAndValidate: manifestBuildMs, manifestJsonStringify: serializeManifestMs, resultJsonlSerialize: serializeResultsMs},
  note: 'Measurements cover metadata construction, validation and serialization only; no scenario simulation ran.'
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
