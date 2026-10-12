import {execFileSync} from 'node:child_process';
import os from 'node:os';

const PHASES = ['engine', 'snapshot', 'serialization', 'worker', 'ui', 'layout', 'render', 'startup'];

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
  results,
  limitations = [],
}) {
  const cpu = os.cpus()[0]?.model ?? null;
  const revision = gitValue(['rev-parse', 'HEAD']);
  const dirty = (gitValue(['status', '--porcelain']) ?? '').length > 0;
  const phaseReports = Object.fromEntries(PHASES.map(phase => [
    phase,
    phases[phase] ?? {status: 'not-measured', measurements: []},
  ]));

  return {
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
    results,
    limitations,
  };
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
