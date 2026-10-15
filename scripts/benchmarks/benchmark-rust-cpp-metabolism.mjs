import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const manifest = 'experiments/cpp-metabolism/Cargo.toml';
const clean = spawnSync('cargo', ['clean', '--manifest-path', manifest], { encoding: 'utf8' });
if (clean.status !== 0) {
  process.stderr.write(clean.stderr || clean.stdout);
  process.exit(clean.status ?? 1);
}
const start = performance.now();
const build = spawnSync('cargo', ['build', '--release', '--manifest-path', manifest], { encoding: 'utf8' });
if (build.status !== 0) {
  process.stderr.write(build.stderr || build.stdout || build.error?.message || 'cargo build failed');
  process.exit(build.status ?? 1);
}
const buildMs = performance.now() - start;
const executable = process.platform === 'win32'
  ? 'experiments/cpp-metabolism/target/release/cpp-metabolism-benchmark.exe'
  : 'experiments/cpp-metabolism/target/release/cpp-metabolism-benchmark';
const run = spawnSync(executable, { encoding: 'utf8', env: { ...process.env, RIOSE_CPP_BUILD_MS: String(buildMs) } });
if (run.status !== 0) {
  process.stderr.write(run.stderr || run.stdout || run.error?.message || 'benchmark executable failed');
  process.exit(run.status ?? 1);
}
process.stdout.write(run.stdout);
