import {createHash} from 'node:crypto';
import {FarmEngine} from '../engine.js';
import {ColumnHistoryEngine} from './column-history-engine.mjs';

const [variant, countText, hoursText, repetitionsText] = process.argv.slice(2);
const Engine = variant === 'typedColumns' ? ColumnHistoryEngine : FarmEngine;
const count = Number(countText), hours = Number(hoursText), repetitions = Number(repetitionsText);
const collect = () => global.gc?.();
const sampleMemory = () => { const memory = process.memoryUsage(); return {heapUsedBytes: memory.heapUsed, arrayBuffersBytes: memory.arrayBuffers, rssBytes: memory.rss}; };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

{
  const warmup = new Engine(20261012, count);
  warmup.tick(hours, undefined, false);
}
collect();

function oneRun() {
  collect(); const baseline = sampleMemory(), engine = new Engine(20261012, count);
  const tickStarted = performance.now(); engine.tick(hours, undefined, false); const tickMs = performance.now() - tickStarted;
  collect(); const retained = sampleMemory();
  const snapshotStarted = performance.now(), snapshot = engine.snapshot(), snapshotMs = performance.now() - snapshotStarted;
  const digest = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const historyEntries = snapshot.animals.reduce((sum, animal) => sum + animal.history.length, 0);
  collect(); const materialized = sampleMemory();
  return {tickMs, snapshotMs, digest, historyEntries, baselineRssBytes: baseline.rssBytes, retained: {heapUsedBytes: retained.heapUsedBytes - baseline.heapUsedBytes, arrayBuffersBytes: retained.arrayBuffersBytes - baseline.arrayBuffersBytes, rssBytes: retained.rssBytes}, materialized: {heapUsedBytes: materialized.heapUsedBytes - baseline.heapUsedBytes, arrayBuffersBytes: materialized.arrayBuffersBytes - baseline.arrayBuffersBytes, rssBytes: materialized.rssBytes}};
}

const rows = Array.from({length: repetitions}, oneRun);
const summarize = field => ({
  tickMedianMs: median(rows.map(row => row.tickMs)),
  snapshotMedianMs: median(rows.map(row => row.snapshotMs)),
  baselineRssBytesMedian: median(rows.map(row => row.baselineRssBytes)),
  retainedHeapDeltaBytesMedian: median(rows.map(row => row.retained.heapUsedBytes)),
  retainedArrayBuffersDeltaBytesMedian: median(rows.map(row => row.retained.arrayBuffersBytes)),
  retainedRssBytesMedian: median(rows.map(row => row.retained.rssBytes)),
  materializedHeapDeltaBytesMedian: median(rows.map(row => row.materialized.heapUsedBytes)),
  materializedArrayBuffersDeltaBytesMedian: median(rows.map(row => row.materialized.arrayBuffersBytes)),
  materializedRssBytesMedian: median(rows.map(row => row.materialized.rssBytes)),
  historyEntries: rows.at(-1).historyEntries,
  snapshotDigest: rows.at(-1).digest,
  variant: field
});
console.log(JSON.stringify(summarize(variant)));
