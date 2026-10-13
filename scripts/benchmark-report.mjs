import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const PHASES = ['engine', 'snapshot', 'serialization', 'worker', 'ui', 'layout', 'render', 'startup', 'coldStartup', 'warmStartup', 'bridgeMarshaling', 'fullScenario', 'uiEndToEnd', 'memory'];
const MEMORY_TYPES = ['js-heap', 'retained-heap', 'process-rss', 'serialized-payload', 'wasm-memory', 'gpu-memory', 'v8-external-memory', 'arraybuffer-memory'];
const schemaPath = fileURLToPath(new URL('../docs/architecture/benchmark-report.schema.json', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const benchmarkSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validateReport = new Ajv2020({allErrors: true, strict: false}).compile(benchmarkSchema);

function gitValue(args) {
  try {
    return execFileSync('git', args, {cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch (error) {
    gitValue.lastError = error.stderr?.toString().trim() || error.message;
    return null;
  }
}

function memoryTypeFor(metric, unit) {
  const label = String(metric).toLowerCase();
  if (!/bytes?/.test(unit) && !label.includes('memory') && !/heap|rss|payload|wasm|gpu/.test(label)) return undefined;
  if (/gpu/.test(label)) return 'gpu-memory';
  if (/wasm/.test(label)) return 'wasm-memory';
  if (/payload|snapshot-json|serialization|transferbuffer/.test(label)) return 'serialized-payload';
  if (/rss/.test(label)) return 'process-rss';
  if (/retained|materialized/.test(label)) return 'retained-heap';
  if (/arraybuffers?/.test(label)) return 'arraybuffer-memory';
  if (/external/.test(label)) return 'v8-external-memory';
  if (/heap|memory/.test(label)) return 'js-heap';
  if (/bytes?/.test(unit)) return 'serialized-payload';
  return undefined;
}

function summarizeNumericObservations(values) {
  if (!Array.isArray(values) || values.length === 0
    || !values.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    sampleCount: sorted.length,
    median,
    spread: {min: sorted[0], max: sorted.at(-1), range: sorted.at(-1) - sorted[0]},
  };
}

function normalizeStatistics(statistics, measurementDetails = {}) {
  if (!statistics || typeof statistics !== 'object' || Array.isArray(statistics)) return statistics;
  if (statistics.sampleCount === 0 && statistics.median === null && statistics.spread === null) return statistics;
  const observations = statistics.rawObservations
    ?? statistics.observations
    ?? statistics.observationsMs
    ?? statistics.values
    ?? measurementDetails.observations;
  const derived = summarizeNumericObservations(observations);
  const spreadAlias = statistics.spreadMs;
  const median = statistics.median ?? statistics.medianMs ?? statistics.median_ms ?? derived?.median;
  const sampleCount = statistics.sampleCount ?? derived?.sampleCount;
  const spread = statistics.spread ?? (spreadAlias && {
    min: spreadAlias.min,
    max: spreadAlias.max,
    range: spreadAlias.range,
  }) ?? derived?.spread;
  const rawObservations = statistics.rawObservations ?? (Array.isArray(observations) ? observations : undefined);
  return {
    ...statistics,
    ...(rawObservations === undefined ? {} : {rawObservations}),
    sampleCount,
    median,
    spread,
  };
}

/** Wrap a benchmark's measurements in the repository-wide, versioned report envelope. */
export function benchmarkReport({
  name,
  runtime = {},
  hardware = {},
  workload = {},
  configuration = {},
  limits = {},
  phases = {},
  timingBoundaries,
  results,
  limitations = [],
}) {
  const cpu = os.cpus()[0]?.model ?? null;
  const revision = gitValue(['rev-parse', 'HEAD']);
  const status = gitValue(['status', '--porcelain']);
  if (!revision || status === null) throw new Error(`Cannot determine benchmark source revision and dirty state at ${repositoryRoot}: ${gitValue.lastError ?? 'unknown Git error'}; refusing to emit an ambiguous report.`);
  const dirty = status.length > 0;
  const phaseReports = Object.fromEntries(PHASES.map(phase => [
    phase,
    phases[phase]
      ? {
        ...phases[phase],
        measurements: phases[phase].measurements.map(item => ({
          ...item,
          memoryType: item.memoryType ?? memoryTypeFor(item.metric, item.unit),
          statistics: normalizeStatistics(item.statistics, item),
          population: item.population ?? (workload.populations.length === 1
            ? workload.populations[0]
            : 'all configured populations'),
          source: item.source ?? item.method ?? `${name} ${phase} measurement`,
        })),
      }
      : {status: 'not-measured', measurements: []},
  ]));

  if (workload.seed === undefined || workload.seed === null) {
    throw new TypeError('Benchmark report requires an explicit workload.seed; use a descriptive string when no random seed applies.');
  }
  if (!Array.isArray(workload.populations) || workload.populations.length === 0) {
    throw new TypeError('Benchmark report requires at least one explicit workload population.');
  }
  for (const [index, population] of workload.populations.entries()) {
    if (!population || typeof population.scope !== 'string' || !population.scope.trim()) {
      throw new TypeError(`Benchmark population ${index} requires a non-empty scope label.`);
    }
    const hasAnimalCount = Number.isInteger(population.animals) && population.animals >= 0;
    const hasGenericCount = Number.isInteger(population.count) && population.count >= 0
      && typeof population.unit === 'string' && population.unit.trim();
    if (!hasAnimalCount && !hasGenericCount) {
      throw new TypeError(`Benchmark population ${index} requires animals or a count with unit.`);
    }
    if (population.animals >= 100_000 && population.scope !== 'numeric-kernel-only') {
      throw new TypeError('A 100000-animal benchmark population must use scope "numeric-kernel-only".');
    }
    if (Number.isInteger(population.animals)) {
      const scope = population.scope.toLowerCase();
      const isNumericKernel = scope === 'numeric-kernel-only';
      const engineOrRendererLimit = Math.min(
        ...(scope.includes('farmengine') ? [limits.farmEngineMaxAnimals ?? 10_000] : []),
        ...(scope.includes('renderer') ? [limits.rendererMaxAnimals ?? 10_000] : []),
      );
      if (engineOrRendererLimit !== Infinity && population.animals > engineOrRendererLimit) {
        throw new TypeError(`Benchmark population ${index} exceeds its FarmEngine/renderer limit of ${engineOrRendererLimit} animals.`);
      }
      if (isNumericKernel) {
        const numericLimit = limits.numericKernelMaxAnimalsMeasured ?? 100_000;
        if (population.animals > numericLimit) {
          throw new TypeError(`Benchmark population ${index} exceeds its numeric-kernel measurement limit of ${numericLimit} animals.`);
        }
      }
    }
  }
  if (!Array.isArray(timingBoundaries) || timingBoundaries.length === 0) {
    throw new TypeError('Benchmark report requires explicit timingBoundaries for measured phases.');
  }
  const normalizedTimingBoundaries = timingBoundaries.map(boundary => ({
    ...boundary,
    whatIsTimed: boundary.whatIsTimed ?? boundary.timed,
    whatIsNotTimed: boundary.whatIsNotTimed ?? boundary.notTimed,
  }));

  const report = {
    schemaVersion: 2,
    benchmark: {name, source: {revision, dirty}},
    runtime: {node: process.version, platform: process.platform, ...runtime},
    hardware: {
      os: `${os.type()} ${os.release()}`,
      architecture: os.arch(),
      cpu,
      gpuMemoryBytes: null,
      ...hardware,
      // Software-rendered/headless contexts do not expose memory allocated by the GPU.
      gpuMemoryBytes: hardware.gpuMemoryBytes ?? null,
    },
    workload: {
      seed: null,
      populations: [],
      ...workload,
    },
    configuration: {
      warmupRuns: null,
      repetitions: null,
      ...configuration,
    },
    limits: {
      farmEngineMaxAnimals: 10_000,
      rendererMaxAnimals: 10_000,
      numericKernelMaxAnimalsMeasured: 100_000,
      ...limits,
    },
    phases: phaseReports,
    timingBoundaries: normalizedTimingBoundaries,
    results,
    limitations,
  };
  assertBenchmarkReport(report);
  return report;
}

export function assertBenchmarkReport(report) {
  const warmupRuns = report?.configuration?.warmupRuns;
  const validWarmups = Number.isInteger(warmupRuns) && warmupRuns >= 0
    || (warmupRuns !== null && typeof warmupRuns === 'object' && !Array.isArray(warmupRuns)
      && Object.keys(warmupRuns).length > 0
      && Object.values(warmupRuns).every(value => Number.isInteger(value) && value >= 0));
  if (!validWarmups) {
    throw new TypeError('Invalid benchmark report: configuration.warmupRuns must be a non-negative integer or a non-empty map of non-negative integers.');
  }
  if (!Number.isInteger(report?.configuration?.repetitions) || report.configuration.repetitions < 1) {
    throw new TypeError('Invalid benchmark report: configuration.repetitions must be a positive integer.');
  }
  const source = report?.benchmark?.source;
  if (source?.dirty === false && (typeof source.revision !== 'string' || !/^[0-9a-f]{7,64}$/i.test(source.revision))) {
    throw new TypeError('Invalid benchmark report: a clean capture requires a valid hexadecimal source revision.');
  }
  if (!validateReport(report)) {
    const details = validateReport.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new TypeError(`Invalid benchmark report: ${details}`);
  }
  if (report.schemaVersion >= 2 && report.timingBoundaries.some(boundary =>
    JSON.stringify(boundary.whatIsTimed) !== JSON.stringify(boundary.timed)
      || JSON.stringify(boundary.whatIsNotTimed) !== JSON.stringify(boundary.notTimed))) {
    throw new TypeError('Invalid benchmark report: whatIsTimed/whatIsNotTimed must match the timing boundary aliases timed/notTimed.');
  }
  if (report.benchmark.name === 'scenario-scheduler-concurrency') {
    const availableParallelism = report.results.environment.reportedAvailableParallelism;
    const workloadAvailableWorkers = Math.min(availableParallelism, report.results.workload.scenarios);
    const expectedConcurrencyCases = [...new Set([1, Math.min(2, workloadAvailableWorkers), workloadAvailableWorkers])];
    if (report.results.environment.workloadAvailableWorkers !== workloadAvailableWorkers
      || JSON.stringify(report.configuration.concurrencyCases) !== JSON.stringify(expectedConcurrencyCases)
      || JSON.stringify(report.results.rows.map(row => row.concurrency)) !== JSON.stringify(expectedConcurrencyCases)) {
      throw new TypeError('Invalid benchmark report: concurrency cases must cover serial, two-worker, and effective-available limits after workload capping.');
    }
    for (const [rowIndex, row] of report.results.rows.entries()) {
      const oneCoreMedian = summarizeNumericObservations(row.samples.map(sample => sample.cpuUtilization.oneCoreEquivalentPercent)).median;
      const hostNormalizedMedian = summarizeNumericObservations(row.samples.map(sample => sample.cpuUtilization.hostNormalizedPercent)).median;
      if (!closeEnough(row.medianCpuUtilizationOneCoreEquivalentPercent, oneCoreMedian)
        || !closeEnough(row.medianCpuUtilizationHostNormalizedPercent, hostNormalizedMedian)) {
        throw new TypeError(`Invalid benchmark report: scenario scheduler row ${rowIndex} CPU utilization medians do not match the raw samples.`);
      }
      for (const [sampleIndex, sample] of row.samples.entries()) {
        const prefix = `scenario scheduler row ${rowIndex} sample ${sampleIndex}`;
        const cpu = sample.processCpuMs;
        const utilization = sample.cpuUtilization;
        const close = closeEnough;
        if (!close(cpu.total, cpu.user + cpu.system)) {
          throw new TypeError(`Invalid benchmark report: ${prefix} process CPU total does not equal user plus system CPU.`);
        }
        const oneCore = cpu.total / sample.wallMs * 100;
        if (!close(utilization.oneCoreEquivalentPercent, oneCore)) {
          throw new TypeError(`Invalid benchmark report: ${prefix} one-core-equivalent CPU utilization does not match process CPU and workload wall time.`);
        }
        if (utilization.normalizationCores !== availableParallelism
          || !close(utilization.hostNormalizedPercent, oneCore / availableParallelism)) {
          throw new TypeError(`Invalid benchmark report: ${prefix} host-normalized CPU utilization does not match os.availableParallelism.`);
        }
      }
    }
  }
  const declaredBoundaries = new Set(report.timingBoundaries.map(boundary => boundary.phase));
  for (const [phase, phaseReport] of Object.entries(report.phases)) {
    if (phaseReport.status === 'measured' && !declaredBoundaries.has(phase)) {
      throw new TypeError(`Invalid benchmark report: measured phase "${phase}" has no timing boundary.`);
    }
    if (phaseReport.status !== 'measured') continue;
    for (const [index, item] of phaseReport.measurements.entries()) {
      const statistics = item.statistics;
      const spread = statistics.spread;
      const unavailable = statistics.sampleCount === 0 && statistics.median === null && spread === null;
      const summarized = Number.isInteger(statistics.sampleCount) && statistics.sampleCount > 0
        && typeof statistics.median === 'number' && Number.isFinite(statistics.median)
        && spread && typeof spread === 'object'
        && Number.isFinite(spread.min) && Number.isFinite(spread.max)
        && Number.isFinite(spread.range) && spread.range >= 0;
      if (!unavailable && !summarized) {
        throw new TypeError(`Invalid benchmark report: measured phase "${phase}" measurement ${index} requires sampleCount, median, and min/max/range spread statistics.`);
      }
      if (typeof item.metric !== 'string' || !item.metric.trim() || typeof item.unit !== 'string' || !item.unit.trim()) {
        throw new TypeError(`Invalid benchmark report: measured phase "${phase}" measurement ${index} requires a metric and unit.`);
      }
      if (item.memoryType !== undefined && !MEMORY_TYPES.includes(item.memoryType)) {
        throw new TypeError(`Invalid benchmark report: unsupported memory type "${item.memoryType}".`);
      }
      const memoryType = memoryTypeFor(item.metric, item.unit);
      if (report.schemaVersion >= 2 && /bytes?/.test(item.unit) && !item.memoryType) {
        throw new TypeError(`Invalid benchmark report: byte measurement "${item.metric}" requires a canonical memoryType.`);
      }
      if (report.schemaVersion >= 2 && memoryType && item.memoryType !== memoryType) {
        throw new TypeError(`Invalid benchmark report: memory measurement "${item.metric}" requires memoryType "${memoryType}".`);
      }
      if (report.schemaVersion >= 2 && !unavailable) {
        const observations = statistics.rawObservations ?? statistics.observations ?? statistics.observationsMs
          ?? statistics.values ?? item.observations ?? item.observationsMs;
        if (!summarizeNumericObservations(observations)) {
          throw new TypeError(`Invalid benchmark report: measured phase "${phase}" measurement ${index} must preserve numeric raw observations.`);
        }
      }
      if (!unavailable && /^(ms|millisecond|milliseconds|s|second|seconds)$/.test(item.unit)) {
        const values = [statistics.median, statistics.spread?.min, statistics.spread?.max,
          ...(statistics.rawObservations ?? statistics.observations ?? statistics.observationsMs ?? statistics.values ?? item.observations ?? item.observationsMs ?? [])];
        if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
          throw new TypeError(`Invalid benchmark report: duration measurement "${item.metric}" must contain finite non-negative values.`);
        }
      }
      const observationSets = [statistics.rawObservations, statistics.observations, statistics.observationsMs,
        statistics.values, item.observations, item.observationsMs].filter(value => value !== undefined);
      if (observationSets.length) {
        for (const observations of observationSets) {
          if (Array.isArray(observations) && observations.length === 0 && unavailable) continue;
          const observedSummary = summarizeNumericObservations(observations);
          if (!observedSummary
            || statistics.sampleCount !== observedSummary.sampleCount
            || statistics.median !== observedSummary.median
            || spread?.min !== observedSummary.spread.min
            || spread?.max !== observedSummary.spread.max
            || spread?.range !== observedSummary.spread.range) {
            throw new TypeError(`Invalid benchmark report: measured phase "${phase}" measurement ${index} statistics do not match its raw observations.`);
          }
        }
      }
    }
  }
  return report;
}

function closeEnough(left, right) {
  return Math.abs(left - right) <= 0.002;
}

export function measurement(phase, metric, unit, statistics, details = {}) {
  return {phase, metric, unit, statistics, ...details};
}

export function summarizeSamples(samples) {
  if (!samples?.length) return {sampleCount: 0, median: null, spread: null, rawObservations: []};
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    sampleCount: sorted.length,
    median,
    spread: {min: sorted[0], max: sorted.at(-1), range: sorted.at(-1) - sorted[0]},
    rawObservations: [...samples],
  };
}

export function benchmarkComparison(left, right) {
  const hardwareIdentity = hardware => {
    if (!hardware || typeof hardware !== 'object') return null;
    const {gpuMemoryBytes: _measuredGpuMemory, ...identity} = hardware;
    return JSON.stringify(identity);
  };
  const fields = [
    ['OS', left?.hardware?.os, right?.hardware?.os],
    ['architecture', left?.hardware?.architecture, right?.hardware?.architecture],
    ['CPU', left?.hardware?.cpu, right?.hardware?.cpu],
    ['hardware metadata', hardwareIdentity(left?.hardware), hardwareIdentity(right?.hardware)],
    ['runtime', JSON.stringify(left?.runtime), JSON.stringify(right?.runtime)],
    ['browser', left?.runtime?.browser ?? left?.results?.browser?.product ?? null, right?.runtime?.browser ?? right?.results?.browser?.product ?? null],
    ['revision', left?.benchmark?.source?.revision, right?.benchmark?.source?.revision],
  ];
  const reasons = fields.filter(([, a, b]) => a == null || b == null || a !== b)
    .map(([name, a, b]) => `${name} differs or is missing (${String(a)} vs ${String(b)})`);
  return {comparable: reasons.length === 0, reasons};
}
