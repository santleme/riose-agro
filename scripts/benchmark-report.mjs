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
  if (!validateReport(report)) {
    const details = validateReport.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new TypeError(`Invalid benchmark report: ${details}`);
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
