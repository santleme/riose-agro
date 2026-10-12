import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {FarmEngine} from '../src/client/engine.js';
import {encodeScenarioSnapshot} from '../src/client/scenario-storage.js';
import {loadWasmMetabolism, updateMetabolismJS} from '../src/client/metabolism-wasm.js';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

const herds = (process.env.BENCH_MEMORY_HERDS ?? '100,1000,10000,100000').split(',').map(Number);
const repetitions = Number(process.env.BENCH_MEMORY_REPETITIONS ?? 3);
const seed = 20261012;
const tickHours = 24;
const wasmUrl = new URL('../wasm/riose_core.wasm', import.meta.url);
if (!Number.isInteger(repetitions) || repetitions < 1) throw new RangeError('BENCH_MEMORY_REPETITIONS must be a positive integer');
const wasmBytesFile = await readFile(wasmUrl);

function loadBenchmarkWasm() {
  return loadWasmMetabolism(new URL('http://benchmark.local/riose_core.wasm'), async () => new Response(wasmBytesFile, {
    headers: {'content-type': 'application/wasm'},
  }));
}

function rssHighWaterBytes() {
  const value = process.resourceUsage().maxRSS;
  // Node reports ru_maxrss in KiB on Linux and bytes on macOS.
  return process.platform === 'darwin' ? value : value * 1024;
}

function memorySample(wasmMemoryBytes = null) {
  const memory = process.memoryUsage();
  return {
    jsHeapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
    rssProcessBytes: memory.rss,
    rssProcessHighWaterBytes: rssHighWaterBytes(),
    wasmLinearMemoryBytes: wasmMemoryBytes,
    gpuMemoryBytes: null,
  };
}

function collect() {
  if (typeof global.gc === 'function') global.gc();
}

function delta(after, before) {
  return Object.fromEntries(Object.keys(after).map(key => [
    key,
    typeof after[key] === 'number' && typeof before[key] === 'number' ? after[key] - before[key] : null,
  ]));
}

async function observe(action, wasmBytes = () => null) {
  collect();
  const before = memorySample(wasmBytes());
  const started = performance.now();
  await action();
  const elapsedMs = performance.now() - started;
  const observedAfterOperation = memorySample(wasmBytes());
  collect();
  const after = memorySample(wasmBytes());
  return {
    elapsedMs,
    memory: {
      bestAvailablePeakProxy: {
        processRssHighWaterBytes: observedAfterOperation.rssProcessHighWaterBytes,
        processRssBytesImmediatelyAfterOperation: observedAfterOperation.rssProcessBytes,
        jsHeapUsedBytesImmediatelyAfterOperation: observedAfterOperation.jsHeapUsedBytes,
        jsHeapPeakBytes: null,
        note: 'Cumulative process high-water RSS; synchronous transient heap peaks are not observable in this harness.',
      },
      postGcRetainedDelta: delta(after, before),
      before,
      observedAfterOperation,
      after,
    },
  };
}

function makeWorkerView(engine, selectedAnimalId = 1) {
  // Mirrors worker.js's current packed view projection. This measures its payload
  // construction in Node; it does not claim to measure browser Worker transport.
  const state = engine.state, animals = state.animals;
  const ids = new Uint32Array(animals.length);
  const values = new Float64Array(animals.length * 4);
  const actions = new Uint8Array(animals.length);
  const actionCodes = {grazing: 0, feeding: 1, drinking: 2, resting: 3};
  for (let index = 0; index < animals.length; index++) {
    const animal = animals[index], offset = index * 4;
    ids[index] = animal.id;
    values[offset] = animal.x; values[offset + 1] = animal.y;
    values[offset + 2] = animal.weight; values[offset + 3] = animal.initialWeight;
    actions[index] = actionCodes[animal.action] ?? 0;
  }
  const selected = animals.find(animal => animal.id === selectedAnimalId) ?? animals[0];
  return {
    type: 'view', hour: state.hour, pastures: state.pastures, cost: state.cost,
    intake: state.intake, config: state.config, events: state.events.slice(0, 20),
    animalIds: ids, animalValues: values, animalActions: actions,
    selectedAnimalId: selected?.id ?? null, selectedHistory: engine.historyFor(selected),
  };
}

async function measureHerd(count) {
  const wasm = await loadBenchmarkWasm();
  const wasmBytes = () => wasm.memoryBytes();
  const phases = {};
  let engine, snapshot, encoded, view;
  const startup = await observe(() => {
    engine = new FarmEngine(seed, count);
    return engine;
  }, wasmBytes);
  phases.startup = {...startup, payloadBytes: null, method: 'FarmEngine construction; post-GC retained delta from pre-construction baseline.'};

  const tick = await observe(() => engine.tick(tickHours, wasm, false), wasmBytes);
  phases.engine = {...tick, payloadBytes: null, method: '24-hour FarmEngine tick with WASM metabolism; no snapshot or renderer.'};

  const snap = await observe(() => { snapshot = engine.snapshot(); return snapshot; }, wasmBytes);
  const jsonUtf8Bytes = Buffer.byteLength(JSON.stringify(snapshot));
  phases.snapshot = {...snap, payloadBytes: {jsonUtf8Bytes}, method: 'Full engine snapshot clone; JSON byte count is payload size, not retained heap.'};

  const compressed = await observe(async () => { encoded = await encodeScenarioSnapshot(snapshot); return encoded; }, wasmBytes);
  const encodedBytes = Buffer.byteLength(encoded);
  phases.serialization = {
    ...compressed,
    payloadBytes: {
      jsonUtf8Bytes,
      gzipBytes: Math.floor(encodedBytes * 3 / 4) - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0),
      base64Utf8Bytes: encodedBytes,
    },
    method: 'Existing gzip-plus-base64 snapshot encoder; output retained to measure post-GC storage representation.',
  };

  const workerView = await observe(() => { view = makeWorkerView(engine); return view; }, wasmBytes);
  phases.worker = {
    ...workerView,
    payloadBytes: {
      transferableArrayBuffers: view.animalIds.byteLength + view.animalValues.byteLength + view.animalActions.byteLength,
      animalIdsBytes: view.animalIds.byteLength,
      animalValuesBytes: view.animalValues.byteLength,
      animalActionsBytes: view.animalActions.byteLength,
      metadataJsonUtf8Bytes: Buffer.byteLength(JSON.stringify({type: view.type, hour: view.hour, pastures: view.pastures, cost: view.cost, intake: view.intake, config: view.config, events: view.events, selectedAnimalId: view.selectedAnimalId, selectedHistory: view.selectedHistory})),
    },
    method: 'Node-side projection matching worker.js view fields; transferable buffer lengths are exact, browser structured-clone/transport cost is not measured.',
  };
  wasm.dispose();
  return phases;
}

async function measureNumericKernel(count) {
  const wasm = await loadBenchmarkWasm();
  const input = new Float64Array(count * 4);
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    input[offset] = 330 + index % 70; input[offset + 1] = 75;
    input[offset + 2] = (index % 100) / 100; input[offset + 3] = index % 6 === 0 ? 1 : 0;
  }
  const output = new Float64Array(count * 2);
  const runKernel = await observe(() => wasm(input, count, output), () => wasm.memoryBytes());
  const jsRun = await observe(() => updateMetabolismJS(input, count, output), () => null);
  const result = {
    wasm: {...runKernel, payloadBytes: {inputArrayBufferBytes: input.byteLength, outputArrayBufferBytes: output.byteLength}, method: 'Isolated 100000-capable numeric kernel only; input/output typed arrays preallocated.'},
    javascript: {...jsRun, payloadBytes: {inputArrayBufferBytes: input.byteLength, outputArrayBufferBytes: output.byteLength}, method: 'Isolated numeric kernel only; input/output typed arrays preallocated.'},
  };
  wasm.dispose();
  return result;
}

const allResults = [];
for (const count of herds) {
  if (count === 100_000) {
    const numericRows = [];
    for (let run = 0; run < repetitions; run++) numericRows.push(await measureNumericKernel(count));
    allResults.push({animals: count, scope: 'numeric-kernel-only', numericKernel: numericRows});
    continue;
  }
  if (![100, 1_000, 10_000].includes(count)) throw new RangeError(`Unsupported memory benchmark herd: ${count}`);
  const runs = [];
  for (let run = 0; run < repetitions; run++) runs.push(await measureHerd(count));
  allResults.push({animals: count, scope: 'FarmEngine', runs});
}

const phaseNames = ['startup', 'engine', 'snapshot', 'serialization', 'worker'];
const measurements = Object.fromEntries(phaseNames.map(phase => [phase, []]));
function addAggregatedMeasurements(phase, population, scope, rows, implementation = undefined) {
  const specs = [
    ['postGcRetainedJsHeapDelta', row => row.memory.postGcRetainedDelta.jsHeapUsedBytes, 'bytes', true],
    ['postGcRetainedExternalDelta', row => row.memory.postGcRetainedDelta.externalBytes, 'bytes', true],
    ['postGcRetainedArrayBuffersDelta', row => row.memory.postGcRetainedDelta.arrayBuffersBytes, 'bytes', true],
    ['postGcRetainedWasmLinearMemoryDelta', row => row.memory.postGcRetainedDelta.wasmLinearMemoryBytes, 'bytes', true],
    ['processRssHighWaterCumulative', row => row.memory.bestAvailablePeakProxy.processRssHighWaterBytes, 'bytes', false],
    ['processRssImmediatelyAfterOperation', row => row.memory.bestAvailablePeakProxy.processRssBytesImmediatelyAfterOperation, 'bytes', false],
    ['jsHeapUsedImmediatelyAfterOperation', row => row.memory.bestAvailablePeakProxy.jsHeapUsedBytesImmediatelyAfterOperation, 'bytes', false],
    ['operationDuration', row => row.elapsedMs, 'ms', false],
  ];
  for (const [metric, getValue, unit, normalizePerAnimal] of specs) {
    const values = rows.map(getValue).filter(Number.isFinite);
    measurements[phase].push(measurement(phase, metric, unit, summarizeSamples(values), {
      population, scope, ...(implementation ? {implementation} : {}),
      observations: values, memorySamples: rows.map(row => row.memory),
      payloadBytes: rows.at(-1).payloadBytes, method: rows.at(-1).method,
    }));
    if (normalizePerAnimal) measurements[phase].push(measurement(phase, `${metric}PerAnimal`, 'bytes/animal', summarizeSamples(values.map(value => value / population)), {
      population, scope, ...(implementation ? {implementation} : {}),
      observations: values.map(value => value / population), normalizedFrom: metric,
      method: rows.at(-1).method,
    }));
  }
  const payloadFields = Object.keys(rows.at(-1).payloadBytes ?? {});
  for (const field of payloadFields) {
    const values = rows.map(row => row.payloadBytes?.[field]).filter(Number.isFinite);
    measurements[phase].push(measurement(phase, `payload${field[0].toUpperCase()}${field.slice(1)}`, 'bytes', summarizeSamples(values), {
      population, scope, ...(implementation ? {implementation} : {}), observations: values,
      method: rows.at(-1).method,
    }));
    measurements[phase].push(measurement(phase, `payload${field[0].toUpperCase()}${field.slice(1)}PerAnimal`, 'bytes/animal', summarizeSamples(values.map(value => value / population)), {
      population, scope, ...(implementation ? {implementation} : {}), observations: values.map(value => value / population),
      normalizedFrom: `payload${field[0].toUpperCase()}${field.slice(1)}`, method: rows.at(-1).method,
    }));
  }
}

for (const row of allResults) {
  if (row.scope === 'FarmEngine') for (const phase of phaseNames) addAggregatedMeasurements(phase, row.animals, row.scope, row.runs.map(run => run[phase]));
  else for (const variant of ['wasm', 'javascript']) {
    const kernelRows = row.numericKernel.map(sample => sample[variant]);
    addAggregatedMeasurements('engine', row.animals, row.scope, kernelRows, variant);
    const wasmSamples = kernelRows.map(sample => sample.memory.after.wasmLinearMemoryBytes).filter(Number.isFinite);
    measurements.engine.push(measurement('engine', 'wasmLinearMemoryBytesAfterKernel', 'bytes', summarizeSamples(wasmSamples), {
      population: row.animals, scope: row.scope, implementation: variant, observations: wasmSamples,
    }));
  }
}

console.log(JSON.stringify(benchmarkReport({
  name: 'memory-profile',
  workload: {
    seed,
    populations: allResults.map(row => ({animals: row.animals, scope: row.scope, limit: row.scope === 'FarmEngine' ? 'FarmEngine maximum 10000' : 'numeric-kernel-only; no FarmEngine or Worker'})),
    tickHours,
  },
  configuration: {warmupRuns: 0, repetitions, gc: typeof global.gc === 'function' ? 'forced before/after phase' : 'unavailable; run with --expose-gc'},
  phases: Object.fromEntries(phaseNames.map(phase => [phase, {status: measurements[phase].length ? 'measured' : 'not-measured', measurements: measurements[phase]}])),
  results: {samples: allResults, memoryFields: ['jsHeapUsedBytes', 'externalBytes', 'arrayBuffersBytes', 'rssProcessBytes', 'rssProcessHighWaterBytes', 'wasmLinearMemoryBytes', 'gpuMemoryBytes']},
  limitations: [
    'RSS is a process-level measurement and is not attributed to FarmEngine, WASM, or an individual herd phase.',
    'process.resourceUsage().maxRSS is a cumulative process high-water mark, not a per-phase peak; synchronous transient JS heap peaks and allocation counts are unavailable here.',
    'Post-GC retained deltas are measured after forced GC when available; without --expose-gc they are observational deltas, not retained-memory estimates.',
    'WASM linear memory is reported separately from JS ArrayBuffer and heap fields; GPU memory is null because this Node harness has no GPU memory instrumentation.',
    'Worker view reports the current packed projection and transferable payload sizes in Node; it does not measure browser Worker transport, renderer, or GPU allocations.',
    '100000 animals measures only preallocated numeric-kernel input/output and JS/WASM kernel behavior; FarmEngine, snapshots, compressed storage and Worker view are unsupported at that size.',
    'Compression payload bytes are JSON UTF-8, gzip bytes and base64 UTF-8; localStorage quota and browser-specific behavior are not measured.',
  ],
}), null, 2));
