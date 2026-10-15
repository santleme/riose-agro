import os from 'node:os';
import {chromium} from 'playwright';
import {benchmarkReport, measurement, summarizeSamples} from './benchmark-report.mjs';

const origin = process.env.RIOSE_URL ?? 'http://127.0.0.1:8000/';
const populations = [100, 1000, 10000];
const days = Number(process.env.SCENARIO_LAB_DAYS ?? 7);
const repetitions = Number(process.env.SCENARIO_LAB_REPETITIONS ?? 3);
const warmups = Number(process.env.SCENARIO_LAB_WARMUPS ?? 1);
if (!Number.isInteger(days) || days < 1 || days > 30
  || !Number.isInteger(repetitions) || repetitions < 1
  || !Number.isInteger(warmups) || warmups < 0) {
  throw new Error('Use SCENARIO_LAB_DAYS 1–30, repetitions >= 1, and warmups >= 0.');
}

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await page.addInitScript(() => {
  window.__scenarioLabBenchmark = {result: null, resultReceivedAt: null, renderCompletedAt: null};
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        if (event.data?.type !== 'scenarioSet') return;
        window.__scenarioLabBenchmark.result = event.data.data;
        window.__scenarioLabBenchmark.resultReceivedAt = performance.now();
      }, {capture: true});
    }
  };
  new MutationObserver(() => {
    const state = window.__scenarioLabBenchmark;
    const results = document.querySelector('#results:not([hidden])');
    const cells = document.querySelectorAll('#scenario-population [role="gridcell"]');
    if (state.resultReceivedAt !== null && state.renderCompletedAt === null && results && cells.length > 0) {
      requestAnimationFrame(() => { state.renderCompletedAt = performance.now(); });
    }
  }).observe(document, {subtree: true, childList: true, attributes: true});
});

const samples = Object.fromEntries(populations.map(count => [count, {uiEndToEnd: [], workerToRender: [], selectionRender: [], payloadBytes: [], gridCells: [], domNodes: [], memoryBytes: []}]));
let browserInfo = null;
const runOnce = async count => {
  await page.goto(new URL('/scenario-lab.html', origin).toString(), {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => { window.__scenarioLabBenchmark = {result: null, resultReceivedAt: null, renderCompletedAt: null}; });
  await page.locator('#scenario-form [name="animalCount"]').fill(String(count));
  await page.locator('#scenario-form [name="durationDays"]').fill(String(days));
  await page.getByRole('button', {name: /Review scenarios/}).click();
  await page.getByRole('button', {name: 'Run scenarios'}).waitFor({state: 'visible'});
  const started = await page.evaluate(() => performance.now());
  await page.getByRole('button', {name: 'Run scenarios'}).click();
  await page.locator('#results:not([hidden])').waitFor({timeout: 180000});
  await page.waitForFunction(() => window.__scenarioLabBenchmark.renderCompletedAt !== null, null, {timeout: 30000});
  const result = await page.evaluate(async () => {
    const observed = window.__scenarioLabBenchmark;
    const json = JSON.stringify(observed.result);
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      deviceMemoryGiB: navigator.deviceMemory ?? null,
      viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
      workerToRenderMs: observed.renderCompletedAt - observed.resultReceivedAt,
      resultJsonBytes: new TextEncoder().encode(json).byteLength,
      scenarioCount: observed.result?.scenarios?.length + 1,
      checkpointCount: observed.result?.baseline?.timeline?.length,
      gridCells: document.querySelectorAll('#scenario-population [role="gridcell"]').length,
    };
  });
  result.selectionRenderMs = await page.evaluate(async () => {
    const startedAt = performance.now();
    document.querySelector('#scenario-population [role="gridcell"]')?.click();
    await new Promise(requestAnimationFrame);
    return performance.now() - startedAt;
  });
  const metrics = new Map((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const uiEndToEndMs = await page.evaluate(startedAt => performance.now() - startedAt, started);
  return {...result, uiEndToEndMs, rendererHeapBytes: metrics.has('JSHeapUsedSize') ? metrics.get('JSHeapUsedSize') : null,
    rendererDomNodes: metrics.has('Nodes') ? metrics.get('Nodes') : null};
};

try {
  for (const count of populations) {
    for (let index = 0; index < warmups; index++) await runOnce(count);
    for (let index = 0; index < repetitions; index++) {
      const result = await runOnce(count);
      browserInfo = result;
      const target = samples[count];
      target.uiEndToEnd.push(result.uiEndToEndMs);
      target.workerToRender.push(result.workerToRenderMs);
      target.selectionRender.push(result.selectionRenderMs);
      target.payloadBytes.push(result.resultJsonBytes);
      target.gridCells.push(result.gridCells);
      if (result.rendererDomNodes !== null) target.domNodes.push(result.rendererDomNodes);
      if (result.rendererHeapBytes !== null) target.memoryBytes.push(result.rendererHeapBytes);
      if (result.scenarioCount !== 3 || result.gridCells !== Math.min(count, 1200)) {
        throw new Error(`Unexpected actual product result for ${count} animals: ${JSON.stringify(result)}`);
      }
    }
  }

  const workload = populations.map(animals => ({animals, scope: 'FarmEngine Product V3 scenario lab', limit: 'supported maximum 10,000 animals'}));
  const perPopulation = (phase, metric, unit, field, details = {}) => populations.map(animals => {
    const observations = samples[animals][field];
    return measurement(phase, metric, unit, summarizeSamples(observations), {
      population: {animals, scope: 'FarmEngine Product V3 scenario lab'}, observations, ...details,
    });
  });
  const memoryMeasurements = populations.flatMap(animals => samples[animals].memoryBytes.length
    ? [measurement('memory', 'rendererJsHeapUsedAfterRender', 'bytes', summarizeSamples(samples[animals].memoryBytes), {
      population: {animals, scope: 'FarmEngine Product V3 scenario lab'},
      observations: samples[animals].memoryBytes,
      memoryType: 'js-heap',
      source: 'Chrome DevTools Protocol Performance.getMetrics JSHeapUsedSize in the page renderer after render; excludes separately running Worker heaps and browser-process/GPU memory.',
    })]
    : []);
  const report = benchmarkReport({
    name: 'product-v3-scenario-lab-population',
    runtime: {platform: process.platform, node: process.version, browser: 'chromium', browserVersion: (await browser.version()), browserUserAgent: browserInfo.userAgent},
    hardware: {os: `${os.type()} ${os.release()}`, architecture: os.arch(), cpu: os.cpus()[0]?.model ?? null,
      browserDevice: {hardwareConcurrency: browserInfo.hardwareConcurrency, deviceMemoryGiB: browserInfo.deviceMemoryGiB,
        devicePixelRatio: browserInfo.viewport.devicePixelRatio, viewport: browserInfo.viewport}},
    workload: {seed: 20261015, populations: workload, scenario: {arms: 3, factor: 'supplement', durationDays: days,
      levelsKgDMPerHeadPerDay: [0.5, 1, 1.5], selectedOutput: 'actual rendered stable-ID population grid'}},
    configuration: {warmupRuns: warmups, repetitions, browserCacheState: 'same isolated headless Chromium context; page navigated between runs'},
    limits: {farmEngineMaxAnimals: 10000, numericKernelMaxAnimalsMeasured: 100000},
    phases: {
      uiEndToEnd: {status: 'measured', measurements: perPopulation('uiEndToEnd', 'reviewedRunToRenderedGrid', 'ms', 'uiEndToEnd', {
        source: 'Product V3 UI: click Run scenarios until actual results and population cells are visible; includes Worker execution and rendering.',
      })},
      render: {status: 'measured', measurements: perPopulation('render', 'scenarioResultMessageToPaintedGrid', 'ms', 'workerToRender', {
        source: 'Performance timestamp at Worker scenarioSet message capture through next animation frame after actual population grid appears; includes UI result projection, DOM creation, and paint scheduling.',
      })},
      ui: {status: 'measured', measurements: perPopulation('ui', 'selectedAnimalGridAndInspectorUpdate', 'ms', 'selectionRender', {
        source: 'Actual first animal cell click to next animation frame after the selected-animal inspector changes; includes rebuilding the visible grid.',
      })},
      serialization: {status: 'measured', measurements: perPopulation('serialization', 'scenarioResultJsonProjection', 'bytes', 'payloadBytes', {
        memoryType: 'serialized-payload',
        source: 'UTF-8 size of JSON.stringify over the actual Worker result. A size proxy, not the browser structured-clone wire size.',
      })},
      layout: {status: 'measured', measurements: perPopulation('layout', 'visibleAnimalGridCells', 'cells', 'gridCells', {
        source: 'Actual Product V3 grid DOM after render; current product cap is 1,200 cells per page.',
      }).concat(perPopulation('layout', 'pageRendererDomNodes', 'nodes', 'domNodes', {
        source: 'Chrome DevTools Protocol Performance.getMetrics Nodes count in page renderer after render; includes all document nodes, not just population cells.',
      }))},
      memory: {status: memoryMeasurements.length ? 'measured' : 'unavailable', measurements: memoryMeasurements},
    },
    timingBoundaries: [
      {phase: 'uiEndToEnd', timed: ['User confirmation click until results and the actual population grid become visible.'], notTimed: ['Browser startup and initial navigation.']},
      {phase: 'render', timed: ['Worker result receipt through the next animation frame after the population grid becomes visible.'], notTimed: ['Worker computation before its result message.']},
      {phase: 'ui', timed: ['Selecting the first animal through the next animation frame after its inspector updates.'], notTimed: ['Keyboard interaction latency, assistive technology, and repeated high-frequency selection.']},
      {phase: 'serialization', timed: ['No timing; UTF-8 result JSON projection size is measured.'], notTimed: ['Structured-clone transfer bytes and serialization time.']},
      {phase: 'layout', timed: ['Rendered population cells and total page DOM node count.'], notTimed: ['No geometric layout duration is isolated.']},
      {phase: 'memory', timed: ['Page-renderer JSHeapUsedSize after render, when Chromium exposes the CDP metric.'], notTimed: ['Worker heaps, browser-process RSS and GPU memory.']},
    ],
    results: {browser: browserInfo, warmupRuns: warmups, repetitions, observationFormat: 'riose-population-observations/v1-compact-history',
      outputOrigin: 'actual deterministic illustrative FarmEngine Worker results; not cattle observations or scientific validation',
      populationGridCap: 1200},
    limitations: [
      'This benchmark measures one local Linux host and one Chromium version; it is not a cross-device performance guarantee.',
      'FarmEngine outputs are illustrative. Performance evidence says nothing about biological validity.',
      'Result JSON byte length is a proxy for structured-clone payload; browser implementation may transfer a different byte count.',
      'The grid cap bounds rendered cell count, not the full Worker result retained by the page. The CDP JS heap is limited to the page renderer and does not include separately running Worker heaps, browser-process RSS or GPU memory.',
      'The one-factor sweep uses a 7-day default horizon unless SCENARIO_LAB_DAYS is specified; no comparison with a different executor is implied.',
    ],
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
