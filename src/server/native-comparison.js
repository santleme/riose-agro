import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';

const MAX_STDOUT_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export function nativeComparisonRunner(env = process.env, root) {
  if (env.RIOSE_NATIVE_COMPARISON !== 'true') return null;
  const binaryName = process.platform === 'win32' ? 'riose-run.exe' : 'riose-run';
  const executable = env.RIOSE_RUNNER_PATH
    ? resolve(env.RIOSE_RUNNER_PATH)
    : resolve(root, 'target/release', binaryName);
  return executable;
}

export async function nativeComparisonAvailable(executable) {
  if (!executable) return false;
  try {
    await access(executable, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function executeNativeConfiguredComparison(request, executable, {
  spawnImpl = spawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!executable) return Promise.reject(new Error('Native comparison runner is disabled.'));
  const input = JSON.stringify(request);
  return new Promise((resolvePromise, rejectPromise) => {
    let child;
    try {
      child = spawnImpl(executable, ['--input', '-'], {stdio: ['pipe', 'pipe', 'pipe']});
    } catch (error) {
      rejectPromise(error);
      return;
    }
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Native comparison runner timed out.'));
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        child.kill('SIGKILL');
        finish(new Error('Native comparison output exceeded the size limit.'));
      } else stdout.push(chunk);
    });
    child.stderr.on('data', chunk => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      const kept = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
      stderrBytes += kept.length;
      stderr.push(kept);
    });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (settled) return;
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        finish(new Error(`Native comparison runner exited with status ${code}${errorText ? `: ${errorText}` : ''}.`));
        return;
      }
      try {
        const record = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        const result = record?.nativeResult?.result;
        const comparison = result?.comparison;
        if (record.type !== 'riose-native-result' || record.status !== 'success'
          || record.scenario !== 'configured-comparison' || result?.type !== 'configured-comparison'
          || !comparison || comparison.validated !== false || !Array.isArray(comparison.rows)) {
          throw new Error('Native comparison runner returned an invalid configured-comparison record.');
        }
        finish(null, {
          comparison,
          engine: record.nativeResult.engine,
          runId: record.runId,
          inputSha256: record.inputSha256,
        });
      } catch (error) {
        finish(error);
      }
    });
    child.stdin.once('error', error => finish(error));
    child.stdin.end(input);
  });
}
