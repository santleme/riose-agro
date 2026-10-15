import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

export async function waitForDevToolsActivePort({
  filePath,
  getExit,
  getStderr = () => '',
  timeoutMs = 30_000,
  pollIntervalMs = 100,
  read = readFile,
  sleep = delay,
}) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath is required');
  if (typeof getExit !== 'function') throw new TypeError('getExit must be a function');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new RangeError('timeoutMs must be non-negative');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new RangeError('pollIntervalMs must be positive');

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const exit = getExit();
    if (exit) {
      const detail = getStderr().trim();
      throw new Error(`Chromium exited before starting a DevTools endpoint (code ${exit.code}, signal ${exit.signal ?? 'none'})${detail ? `:\n${detail}` : ''}`);
    }
    try {
      return await read(filePath, 'utf8');
    } catch {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(pollIntervalMs, remaining));
    }
  }

  const detail = getStderr().trim();
  throw new Error(`Chromium did not start a DevTools endpoint within ${timeoutMs} ms${detail ? `:\n${detail}` : ''}`);
}
