import {parentPort, workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';

const intervalMs = workerData.intervalMs;
let samples = 0;
let peakRssBytes = process.memoryUsage.rss();
let lastSampleMs = performance.now();
let maxObservedPollGapMs = 0;
const timer = setInterval(() => {
  const now = performance.now();
  maxObservedPollGapMs = Math.max(maxObservedPollGapMs, now - lastSampleMs);
  lastSampleMs = now;
  samples++;
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
}, intervalMs);

parentPort.postMessage({type: 'ready'});
parentPort.on('message', message => {
  if (message.type !== 'stop') return;
  clearInterval(timer);
  const now = performance.now();
  maxObservedPollGapMs = Math.max(maxObservedPollGapMs, now - lastSampleMs);
  samples++;
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
  parentPort.postMessage({type: 'stopped', samples, peakRssBytes, intervalMs, maxObservedPollGapMs});
  parentPort.close();
});
