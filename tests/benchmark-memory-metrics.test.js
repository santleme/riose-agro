import test from 'node:test';
import assert from 'node:assert/strict';
import {maxRssKiBToBytes} from '../scripts/benchmark-memory-metrics.mjs';

test('normalizes Node resourceUsage maxRSS KiB to bytes', () => {
  assert.equal(maxRssKiBToBytes(1), 1024);
  assert.equal(maxRssKiBToBytes(25_600), 26_214_400);
  assert.equal(maxRssKiBToBytes(0), 0);
});
