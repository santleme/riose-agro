import {mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {benchmarkReport,measurement,summarizeSamples} from './benchmark-report.mjs';

const outputDirectory = path.resolve('docs/benchmarks/issue-99');
const repeatFiles = Array.from({length: 5}, (_, index) => path.join(outputDirectory, 'raw', `repeat-${index + 1}.json`));
const captures = await Promise.all(repeatFiles.map(async file => JSON.parse(await readFile(file, 'utf8'))));
for (const [repeat, capture] of captures.entries()) {
  capture.results = capture.results.map(result => ({
    ...result,
    repeat: repeat + 1,
    raw: result.raw ?? {
      frameIntervalsMs: result.frameIntervalsMs,
      renderSubmissionMs: result.renderSubmissionSamplesMs,
      sceneUpdateMs: result.sceneUpdateSamplesMs,
      cullingMs: result.cullingSamplesMs,
    },
  }));
}
const gpu = captures[0]?.gpuInfo;
if (captures.length !== 5 || captures.some(capture => capture.fixtureId !== 'approved-livestock-v1'
  || capture.approvedAssetIds?.join(',') !== 'nelore-adult'
  || capture.gpuInfo?.identifiesGtx1060 !== true || capture.gpuInfo?.unmasked !== true || capture.gpuInfo?.softwareFallback !== false)) {
  throw new Error('All five captures must use the approved fixture and independently confirm the physical GTX 1060 through WebGL.');
}

const populations = [1000, 10000], renderers = ['canvas', 'pixi'];
const rows = renderers.flatMap(renderer => populations.map(population => {
  const observations = captures.map((capture, repeat) => {
    const result = capture.results.find(item => item.renderer === renderer && item.count === population);
    if (!result || result.stableIdAccounting?.partitionValid !== true || result.selectionStable !== true
      || result.visibleAnimals + result.culledAnimals !== population
      || result.stableIdAccounting.totalUnique !== population
      || !Number.isInteger(result.renderFrameSampleCount) || result.renderFrameSampleCount !== result.raw?.frameIntervalsMs?.length
      || !Number.isInteger(result.cullingExecutionCount) || result.cullingExecutionCount < 1
      || result.cullingExecutionCount !== result.raw?.cullingMs?.length) {
      throw new Error(`Repeat ${repeat + 1} failed renderer/count/culling-sample checks for ${renderer}/${population}.`);
    }
    return {repeat: repeat + 1, ...result};
  });
  const first = observations[0];
  for (const observation of observations.slice(1)) {
    if (observation.visibleAnimals !== first.visibleAnimals || observation.culledAnimals !== first.culledAnimals
      || observation.stableIdAccounting.visibleIdDigestFnv1a !== first.stableIdAccounting.visibleIdDigestFnv1a
      || observation.stableIdAccounting.culledIdDigestFnv1a !== first.stableIdAccounting.culledIdDigestFnv1a
      || JSON.stringify(observation.selectedAnimalIds) !== JSON.stringify(first.selectedAnimalIds)
      || observation.cameraZoom !== first.cameraZoom || observation.viewportWidth !== first.viewportWidth
      || observation.viewportHeight !== first.viewportHeight || observation.devicePixelRatio !== first.devicePixelRatio) {
      throw new Error(`Scene, camera, viewport, stable IDs, culling, or selection changed between repeats for ${renderer}/${population}.`);
    }
  }
  return {
    renderer,
    population,
    repetitions: observations.length,
    frameMedianMs: summarizeSamples(observations.map(item => item.medianFrameMs)),
    frameP95Ms: summarizeSamples(observations.map(item => item.p95FrameMs)),
    fps: summarizeSamples(observations.map(item => item.meanFps)),
    submissionMedianMs: summarizeSamples(observations.map(item => item.medianPaintMs)),
    submissionP95Ms: summarizeSamples(observations.map(item => item.p95PaintMs)),
    sceneUpdateMedianMs: summarizeSamples(observations.map(item => item.medianSceneUpdateMs)),
    cullingMedianMs: summarizeSamples(observations.map(item => item.medianCullingMs)),
    cullingExecutionCount: summarizeSamples(observations.map(item => item.cullingExecutionCount)),
    renderFrameSampleCount: summarizeSamples(observations.map(item => item.renderFrameSampleCount)),
    workerRoundTripMs: summarizeSamples(observations.map(item => item.workerRoundTripMs)),
    jsHeapBytes: summarizeSamples(observations.map(item => item.heapUsedBytes).filter(Number.isFinite)),
    assetLoadMs: summarizeSamples(observations.map(item => item.assetLoadMs)),
    pixiInitMs: renderer === 'pixi' ? summarizeSamples(observations.map(item => item.pixiInitMs)) : summarizeSamples([0, 0, 0, 0, 0]),
    correctness: {
      visible: first.visibleAnimals,
      culled: first.culledAnimals,
      drawUnits: first.animalRenderUnits,
      visibleByLod: first.visibleByLod,
      stableIdAccounting: first.stableIdAccounting,
      selectedAnimalIds: first.selectedAnimalIds,
      viewport: {width: first.viewportWidth, height: first.viewportHeight, devicePixelRatio: first.devicePixelRatio, renderResolution: first.renderResolution},
      camera: {zoom: first.cameraZoom, anchorAnimalId: 1},
    },
    observations,
  };
}));
for (const population of populations) {
  const canvas = rows.find(row => row.renderer === 'canvas' && row.population === population).correctness;
  const pixi = rows.find(row => row.renderer === 'pixi' && row.population === population).correctness;
  if (canvas.visible !== pixi.visible || canvas.culled !== pixi.culled || canvas.drawUnits !== pixi.drawUnits
    || canvas.stableIdAccounting.visibleIdDigestFnv1a !== pixi.stableIdAccounting.visibleIdDigestFnv1a
    || canvas.stableIdAccounting.culledIdDigestFnv1a !== pixi.stableIdAccounting.culledIdDigestFnv1a
    || JSON.stringify(canvas.selectedAnimalIds) !== JSON.stringify(pixi.selectedAnimalIds)
    || JSON.stringify(canvas.camera) !== JSON.stringify(pixi.camera)
    || JSON.stringify(canvas.viewport) !== JSON.stringify(pixi.viewport)) {
    throw new Error(`Canvas/Pixi correctness inputs differ at population ${population}.`);
  }
}

const flat = (renderer, population, metric) => rows.find(row => row.renderer === renderer && row.population === population)[metric].rawObservations;
const allMeasurements = phase => phase;
const measurements = {
  worker: allMeasurements(renderers.flatMap(renderer => populations.map(population => measurement('worker', 'oneHourTickRoundTrip', 'ms', summarizeSamples(flat(renderer, population, 'workerRoundTripMs')), {renderer, population, method: 'FarmEngine Worker request/reply around one simulated hour'})))),
  ui: allMeasurements(renderers.flatMap(renderer => populations.flatMap(population => [
    measurement('ui', 'sceneUpdate', 'ms', summarizeSamples(flat(renderer, population, 'sceneUpdateMedianMs')), {renderer, population, method: 'Scene construction/update duration captured by graphics-poc-v1'}),
    measurement('ui', 'culling', 'ms', summarizeSamples(flat(renderer, population, 'cullingMedianMs')), {renderer, population, method: 'Viewport culling duration sampled once per actual refreshScene execution; sample count is separate from render-frame count'}),
  ]))),
  render: allMeasurements(renderers.flatMap(renderer => populations.flatMap(population => [
    measurement('render', 'frameIntervalMedian', 'ms', summarizeSamples(flat(renderer, population, 'frameMedianMs')), {renderer, population, method: 'Per-page median requestAnimationFrame interval'}),
    measurement('render', 'frameIntervalP95', 'ms', summarizeSamples(flat(renderer, population, 'frameP95Ms')), {renderer, population, method: 'Per-page p95 requestAnimationFrame interval'}),
    measurement('render', 'meanFps', 'frames/s', summarizeSamples(flat(renderer, population, 'fps')), {renderer, population, method: 'Per-page mean FPS computed from requestAnimationFrame intervals'}),
    measurement('render', 'submissionMedian', 'ms', summarizeSamples(flat(renderer, population, 'submissionMedianMs')), {renderer, population, method: 'JavaScript renderer submission call duration; does not wait for GPU completion'}),
    measurement('render', 'submissionP95', 'ms', summarizeSamples(flat(renderer, population, 'submissionP95Ms')), {renderer, population, method: 'JavaScript renderer submission call p95; does not wait for GPU completion'}),
  ]))),
  startup: allMeasurements(renderers.flatMap(renderer => [
    measurement('startup', 'approvedImageLoad', 'ms', summarizeSamples(captures.map(capture => {
      const load = capture.rendererLoads?.find(item => item.renderer === renderer);
      return load?.assetLoadMs ?? load?.assetsMs;
    })), {renderer, method: 'Approved source image load once per fresh-page renderer; browser cache not cleared between pages'}),
    ...(renderer === 'pixi' ? [measurement('startup', 'pixiRendererInitialization', 'ms', summarizeSamples(captures.map(capture => capture.rendererLoads?.find(item => item.renderer === renderer)?.pixiInitMs)), {renderer, method: 'Pixi renderer initialization once per fresh-page renderer after the approved source image loads'})] : []),
  ])),
  memory: allMeasurements(renderers.flatMap(renderer => populations.map(population => measurement('memory', 'jsHeapUsed', 'bytes', summarizeSamples(flat(renderer, population, 'jsHeapBytes')), {renderer, population, memoryType: 'js-heap', method: 'window.performance.memory.usedJSHeapSize; no forced GC and excludes GPU allocation'})))),
};

const firstCapture = captures[0];
const userAgent = firstCapture.browser;
const report = benchmarkReport({
  name: 'graphics-poc-canvas-vs-pixi-issue-99-gtx1060',
  runtime: {browser: 'Codex In-app Browser (Chromium)', browserVersion: 'Chrome 155.0.0.0', userAgent, rendererBackend: gpu.renderer},
  hardware: {
    os: 'Microsoft Windows 11 Home 10.0.26200', architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? 'Intel Core i5-10400F @ 2.90GHz', cpuCores: 6, cpuThreads: 12,
    gpuMode: 'hardware', gpuModel: 'NVIDIA GeForce GTX 1060 6GB', gpuDriver: '32.0.15.8088 (NVIDIA 580.88)', gpuMemoryBytes: null,
    gpuEvidence: gpu, gpuMemoryNote: 'Renderer product string identifies the 6GB model; no GPU memory query was available.',
    displayModeReportedByWindows: {width: 1024, height: 768, refreshRateHz: 75, source: 'Win32_VideoController'},
    powerMode: 'Desempenho Máximo',
  },
  workload: {
    seed: 20261012,
    populations: populations.map(animals => ({animals, scope: 'FarmEngine Worker and renderer', limit: 'approved-livestock-v1; renderer/FarmEngine maximum 10000'})),
  },
  configuration: {warmupRuns: {eachRendererEachPopulationMs: 800}, repetitions: captures.length, measurementDurationMs: 3000, freshPagePerRepeat: true, cameraZoom: 2, cameraAnchorAnimalId: 1},
  limits: {farmEngineMaxAnimals: 10000, rendererMaxAnimals: 10000, numericKernelMaxAnimalsMeasured: null},
  phases: {
    worker: {status: 'measured', measurements: measurements.worker},
    ui: {status: 'measured', measurements: measurements.ui},
    render: {status: 'measured', measurements: measurements.render},
    startup: {status: 'measured', measurements: measurements.startup},
    memory: {status: 'measured', measurements: measurements.memory},
  },
  timingBoundaries: [
    {phase: 'worker', timed: ['One-hour Worker tick request and reply.'], notTimed: ['Frame sampling, worker reset, browser startup.']},
    {phase: 'ui', timed: ['Scene update and culling duration sampled from the harness.'], notTimed: ['GPU completion; culling is included in scene update and must not be added to it.']},
    {phase: 'render', timed: ['requestAnimationFrame intervals and JavaScript renderer submission calls.'], notTimed: ['GPU completion, physical presentation, VRAM, utilization.']},
    {phase: 'startup', timed: ['Image load duration and Pixi initialization duration.'], notTimed: ['Cold browser launch and cache-cleared network load.']},
    {phase: 'memory', timed: ['Browser-reported JS heap used at the end of each measured case.'], notTimed: ['Forced garbage collection, GPU allocation, process RSS.']},
  ],
  results: {
    fixtureId: firstCapture.fixtureId, approvedAssetIds: firstCapture.approvedAssetIds,
    gpuConfirmation: gpu, baseSha: '9c5838e2a1fbafbf5d3c3a73c3613338dc70261f', branch: 'codex/issue-99-physical-gpu-benchmark',
    method: 'Five sequential fresh-page runs on the physical GPU-backed in-app browser. Each fresh page runs Canvas and Pixi at 1k and 10k, with the same seed, zoom, viewport, culling, LOD, stable IDs and selected animal. Warmup is separate from 3-second measurement windows.',
    visualRegression: {status: 'unavailable', pixelDiffPerformed: false, reason: 'The existing screenshot regression runner could not spawn its local Chromium executable on Windows (Node spawn UNKNOWN). The checked-in screenshot baseline covers Canvas product scenes, not the approved benchmark fixture or Pixi.'},
    rows,
  },
  limitations: [
    'Only one physical GPU and one Chromium-family browser environment were tested.',
    'The in-app browser reported a GTX 1060 through standard WebGL; Windows reported a 75Hz desktop mode while requestAnimationFrame intervals were near 165Hz in some cases. RAF intervals do not prove physical display presentation.',
    'GPU time, GPU utilization, VRAM allocation and CPU utilization are unavailable through permitted page APIs and are not inferred.',
    'JavaScript submission timings are not GPU completion timings. Culling time overlaps scene update time.',
    'The browser cache was retained between fresh-page repetitions; image load values are not cold-cache startup measurements.',
    'The screenshot regression runner could not spawn its local Chromium executable on Windows (Node spawn UNKNOWN); the checked-in baseline also covers Canvas product scenes, not this approved-only fixture or Pixi. No pixel-diff comparison was performed.',
    'The worker timing is a single one-hour tick per renderer/population per fresh-page run; it is not part of frame time.',
  ],
});

const compare = (population, metric) => {
  const canvas = rows.find(row => row.renderer === 'canvas' && row.population === population)[metric].median;
  const pixi = rows.find(row => row.renderer === 'pixi' && row.population === population)[metric].median;
  return {canvas, pixi, absoluteDifference: pixi - canvas, percentChangeVsCanvas: canvas === 0 ? null : (pixi - canvas) / canvas * 100};
};
report.results.comparison = populations.map(population => ({population, fps: compare(population, 'fps'), frameMedianMs: compare(population, 'frameMedianMs'), frameP95Ms: compare(population, 'frameP95Ms'), submissionMedianMs: compare(population, 'submissionMedianMs')}));
await mkdir(outputDirectory, {recursive: true});
await writeFile(path.join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

const rowsForMarkdown = rows.map(row => {
  const percent = values => Number.isFinite(values?.median) && Number.isFinite(values?.spread?.min) && Number.isFinite(values?.spread?.max) ? `${values.median.toFixed(2)} (${values.spread.min.toFixed(2)}–${values.spread.max.toFixed(2)})` : '—';
  const pixiInit = row.renderer === 'pixi' ? percent(row.pixiInitMs) : '—';
  return `| ${row.renderer} | ${row.population.toLocaleString('en-US')} | ${percent(row.fps)} | ${percent(row.frameMedianMs)} | ${percent(row.frameP95Ms)} | ${percent(row.submissionMedianMs)} | ${percent(row.sceneUpdateMedianMs)} | ${percent(row.cullingMedianMs)} | ${percent(row.cullingExecutionCount)} | ${percent(row.renderFrameSampleCount)} | ${percent(row.workerRoundTripMs)} | ${percent(row.assetLoadMs)} | ${pixiInit} | ${percent(row.jsHeapBytes)} | ${row.correctness.visible.toLocaleString('en-US')} / ${row.correctness.culled.toLocaleString('en-US')} | ${row.correctness.drawUnits.toLocaleString('en-US')} |`;
}).join('\n');
const markdown = `# Issue #99 — Canvas vs Pixi on GTX 1060\n\nDecision: **CONDITIONAL_GO**. Pixi was faster in the corrected RAF samples at both populations: at 1k the frame median tied while Pixi had a narrower p95 and higher observed FPS; at 10k the FPS median was ${rows.find(row => row.renderer === 'canvas' && row.population === 10000).fps.median.toFixed(2)} for Canvas and ${rows.find(row => row.renderer === 'pixi' && row.population === 10000).fps.median.toFixed(2)} for Pixi. The single-device result and mismatch between Windows' reported 75Hz display mode and RAF cadence do not justify a product-default change. Keep Canvas as the product default.\n\n## Environment\n\n- Base SHA: \`9c5838e2a1fbafbf5d3c3a73c3613338dc70261f\`\n- OS / CPU: Windows 11 Home 10.0.26200; Intel Core i5-10400F @ 2.90GHz, 6 cores / 12 threads.\n- GPU: NVIDIA GeForce GTX 1060 6GB, driver 32.0.15.8088 (NVIDIA 580.88).\n- Browser: Codex In-app Browser, Chromium / Chrome 155.0.0.0.\n- GPU evidence: standard WebGL reports vendor \`${gpu.vendor}\`, renderer \`${gpu.renderer}\`, \`unmasked=true\`, \`softwareFallback=false\`, \`identifiesGtx1060=true\`.\n- Windows display mode reports 1024×768 at 75Hz; page viewport was ${firstCapture.viewport.width}×${firstCapture.viewport.height} CSS pixels, DPR ${firstCapture.viewport.devicePixelRatio}. The mismatch with measured RAF cadence is a limitation; RAF timing is not physical presentation timing.\n- Power mode: Desempenho Máximo.\n\n## Method\n\nFive sequential fresh-page captures. Every page ran Canvas and Pixi at 1,000 and 10,000 animals using fixture \`approved-livestock-v1\`, asset \`nelore-adult\`, seed 20261012, zoom 2, camera anchor/selected stable ID 1, same viewport, culling, LOD and clustering. Each case used an 800ms warmup and 3,000ms measurement interval. Browser cache remained enabled between pages. Full JSON measurements, including raw frame/submission/update/culling arrays and per-run summaries, are in [report.json](./report.json) and [raw captures](./raw/).\n\n## Results\n\nAll values show median across five fresh pages, with the observed min–max spread. Frame p95 is the median of each page's p95 RAF interval. Culling execution count is measured independently from render-frame sample count; repeated cached culling values are excluded.\n\n| Renderer | Population | FPS | Frame median ms | Frame p95 ms | Submission median ms | Scene update ms | Culling ms | Culling executions/run | Render frames/run | Worker tick ms | Asset load ms | Pixi init ms | JS heap bytes | Visible / culled | Draw units |\n| --- | ${Array(15).fill('---:').join(' | ')} |\n${rowsForMarkdown}\n\nVisible + culled equaled population on every run; visible/culled stable-ID digests were identical between Canvas and Pixi, and animal 1 remained selected. Draw-unit counts matched for both renderers at each population.\n\n## Interpretation\n\n- **1k:** both renderers had a 6.10ms median frame interval, but Canvas' median p95 was 12.20ms versus Pixi's 6.20ms; RAF-derived FPS medians were 131.26 and 161.01 respectively. This indicates more consistent Pixi callbacks in this capture set, though RAF cadence is not physical presentation timing.\n- **10k:** Pixi's FPS median was 161.01 versus Canvas' 56.99; p95 frame intervals were 6.20ms and 24.20ms. Pixi's JavaScript submission was lower, but it does not measure completed GPU work.\n- **Complexity:** evidence supports keeping Pixi available as an option, but not changing the product default from this single browser/GPU profile.\n\n## Limitations\n\n- One GTX 1060 and one Chromium-family in-app browser only; no iGPU, AMD, mobile, or other display profiles.\n- WebGL identifies the physical NVIDIA adapter. GPU duration, utilization and allocated VRAM were not available through permitted browser page APIs. The product model name includes 6GB; allocated VRAM is not measured.\n- Frame timing is requestAnimationFrame callback interval. Renderer submission is JavaScript call time, not GPU completion. The 75Hz Windows mode and 160+ RAF observations do not align.\n- Browser cache stayed enabled between fresh-page runs. Heap is browser-reported \`performance.memory\` when available, without forced GC.\n- Scene update and culling timings overlap; do not sum them. Worker time is a separate one-hour tick.\n- Existing screenshot regression does not include this benchmark fixture; pixel-diff verification for Canvas versus Pixi on this fixture is not available.\n\n## Decision\n\n**CONDITIONAL_GO** — retain Pixi as an optional path for dense scenes and consider further product analysis after collecting results on additional GPUs and browser/display profiles. Keep Canvas as the product default.\n`;
const documentedMarkdown = markdown.replace(
  'Existing screenshot regression does not include this benchmark fixture; pixel-diff verification for Canvas versus Pixi on this fixture is not available.',
  'The screenshot regression runner was unavailable because Node could not spawn local Chromium on Windows (spawn UNKNOWN). Its baseline covers Canvas product scenes, not this fixture or Pixi; no Canvas-vs-Pixi pixel diff is claimed.',
).replace(
  '## Interpretation',
  `## Relative comparison\n\nPercentages compare Pixi median to Canvas median.\n\n| Population | FPS change | Frame median change | Frame p95 change | Frame-median speedup |\n| ---: | ---: | ---: | ---: | ---: |\n${report.results.comparison.map(item => { const speedup = item.frameMedianMs.canvas / item.frameMedianMs.pixi; return `| ${item.population.toLocaleString('en-US')} | ${item.fps.percentChangeVsCanvas.toFixed(1)}% | ${item.frameMedianMs.absoluteDifference.toFixed(2)} ms (${item.frameMedianMs.percentChangeVsCanvas.toFixed(1)}%) | ${item.frameP95Ms.absoluteDifference.toFixed(2)} ms (${item.frameP95Ms.percentChangeVsCanvas.toFixed(1)}%) | ${speedup.toFixed(2)}× |`; }).join('\n')}\n\n## Interpretation`,
);
await writeFile(path.join(outputDirectory, 'report.md'), documentedMarkdown);
console.log(JSON.stringify({json: path.join(outputDirectory, 'report.json'), markdown: path.join(outputDirectory, 'report.md'), rows: rows.map(row => ({renderer: row.renderer, population: row.population, fpsMedian: row.fps.median, frameMedianMs: row.frameMedianMs.median, frameP95Ms: row.frameP95Ms.median, submissionMedianMs: row.submissionMedianMs.median, visible: row.correctness.visible, culled: row.correctness.culled}))}, null, 2));
