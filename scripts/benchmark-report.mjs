import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const PHASES = ['engine', 'snapshot', 'serialization', 'worker', 'ui', 'layout', 'render', 'startup'];
const schemaPath = fileURLToPath(new URL('../docs/architecture/benchmark-report.schema.json', import.meta.url));
const benchmarkSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validateReport = new Ajv2020({allErrors: true, strict: false}).compile(benchmarkSchema);

function gitValue(args) {
  try {
    return execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null;
  } catch {
    return null;
  }
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
  return {
    ...statistics,
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
  const dirty = (gitValue(['status', '--porcelain']) ?? '').length > 0;
  const phaseReports = Object.fromEntries(PHASES.map(phase => [
    phase,
    phases[phase]
      ? {
        ...phases[phase],
        measurements: phases[phase].measurements.map(item => ({
          ...item,
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

  const report = {
    schemaVersion: 1,
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
    timingBoundaries,
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
      const observations = statistics.rawObservations
        ?? statistics.observations
        ?? statistics.observationsMs
        ?? statistics.values
        ?? item.observations;
      if (observations !== undefined) {
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
  return report;
}

export function measurement(phase, metric, unit, statistics, details = {}) {
  return {phase, metric, unit, statistics, ...details};
}

export function summarizeSamples(samples) {
  if (!samples?.length) return {sampleCount: 0, median: null, spread: null};
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return {
    sampleCount: sorted.length,
    median,
    spread: {min: sorted[0], max: sorted.at(-1), range: sorted.at(-1) - sorted[0]},
  };
}
