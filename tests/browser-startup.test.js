import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForDevToolsActivePort} from '../scripts/experiments/browser-startup.mjs';

test('DevTools startup waits for a delayed active-port file', async () => {
  let attempts = 0;
  const active = await waitForDevToolsActivePort({
    filePath: '/tmp/fake/DevToolsActivePort',
    getExit: () => null,
    read: async () => {
      attempts++;
      if (attempts < 3) throw new Error('not written yet');
      return '9222\n/devtools/browser/fake';
    },
    sleep: async () => {},
  });

  assert.equal(active, '9222\n/devtools/browser/fake');
  assert.equal(attempts, 3);
});

test('DevTools startup reports an early browser exit and captured stderr', async () => {
  await assert.rejects(
    waitForDevToolsActivePort({
      filePath: '/tmp/fake/DevToolsActivePort',
      getExit: () => ({code: 127, signal: null}),
      getStderr: () => 'missing shared library',
      read: async () => { throw new Error('unavailable'); },
      sleep: async () => {},
    }),
    /Chromium exited before starting a DevTools endpoint \(code 127, signal none\):\nmissing shared library/,
  );
});

test('DevTools startup gives a bounded timeout with the captured stderr', async () => {
  await assert.rejects(
    waitForDevToolsActivePort({
      filePath: '/tmp/fake/DevToolsActivePort',
      getExit: () => null,
      getStderr: () => 'renderer startup delay',
      timeoutMs: 0,
      read: async () => { throw new Error('unavailable'); },
    }),
    /Chromium did not start a DevTools endpoint within 0 ms:\nrenderer startup delay/,
  );
});
