import {Session} from 'node:inspector';

function post(session, method, parameters = {}) {
  return new Promise((resolve, reject) => {
    session.post(method, parameters, (error, result) => error ? reject(error) : resolve(result));
  });
}

function flattenNodes(node, records = []) {
  records.push(node);
  for (const child of node.children ?? []) flattenNodes(child, records);
  return records;
}

/** Collect a V8 sampled allocation profile without including its duration in benchmark timings. */
export async function sampleAllocations(operation, iterations, samplingIntervalBytes = 8192, sourceUrl = null) {
  if (typeof operation !== 'function') throw new TypeError('Allocation sampling requires an operation function.');
  if (!Number.isInteger(iterations) || iterations < 1) throw new RangeError('Allocation sampling iterations must be a positive integer.');
  if (!Number.isInteger(samplingIntervalBytes) || samplingIntervalBytes < 512) {
    throw new RangeError('Allocation sampling interval must be an integer of at least 512 bytes.');
  }

  // Warm this operation, then collect prior garbage before attributing the sampled pass.
  globalThis.gc?.();
  const warmupIterations = 8;
  for (let index = 0; index < warmupIterations; index++) operation();
  globalThis.gc?.();
  const session = new Session();
  session.connect();
  let samplingStarted = false;
  try {
    await post(session, 'HeapProfiler.startSampling', {
      samplingInterval: samplingIntervalBytes,
      includeObjectsCollectedByMajorGC: true,
    });
    samplingStarted = true;
    for (let index = 0; index < iterations; index++) operation();
    const majorGarbageCollectionForced = typeof globalThis.gc === 'function';
    globalThis.gc?.();
    const {profile} = await post(session, 'HeapProfiler.stopSampling');
    samplingStarted = false;

    const allNodes = flattenNodes(profile.head);
    const nodeById = new Map(allNodes.map(node => [node.id, node]));
    const targetSamples = sourceUrl
      ? profile.samples.filter(sample => nodeById.get(sample.nodeId)?.callFrame?.url === sourceUrl)
      : profile.samples;
    const allocationSites = new Map();
    for (const node of allNodes) {
      if (!node.selfSize) continue;
      const frame = node.callFrame ?? {};
      if (sourceUrl && frame.url !== sourceUrl) continue;
      const key = `${frame.url ?? ''}\u0000${frame.functionName ?? ''}\u0000${frame.lineNumber ?? -1}`;
      const site = allocationSites.get(key) ?? {
        functionName: frame.functionName || '(anonymous)',
        url: frame.url || null,
        lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber + 1 : null,
        estimatedAllocatedBytes: 0,
      };
      site.estimatedAllocatedBytes += node.selfSize;
      allocationSites.set(key, site);
    }
    const topSites = [...allocationSites.values()]
      .sort((left, right) => right.estimatedAllocatedBytes - left.estimatedAllocatedBytes)
      .slice(0, 8);

    const estimatedAllocatedBytes = [...allocationSites.values()]
      .reduce((total, site) => total + site.estimatedAllocatedBytes, 0);
    return {
      method: 'v8-heap-profiler-sampling',
      samplingIntervalBytes,
      warmupIterations,
      iterations,
      majorGarbageCollectionForced,
      allocationSampleCount: targetSamples.length,
      estimatedAllocatedBytes,
      profileSampleCountIncludingHarness: profile.samples.length,
      topSites,
    };
  } finally {
    if (samplingStarted) {
      await post(session, 'HeapProfiler.stopSampling').catch(() => {});
    }
    session.disconnect();
  }
}
