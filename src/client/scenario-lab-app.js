import {FarmEngine} from './engine.js';
import {createScenarioSetManifest, validateScenarioSetManifest} from './scenario-set.js';
import {createBrCorteDmiScenarioManifest, evaluateBrCorteDmiScenarioManifest, validateBrCorteDmiScenarioManifest} from './br-corte-scenario.js';
import {createBrCorteSensitivityManifest, evaluateBrCorteSensitivityManifest} from './br-corte-sensitivity.js';
import {scenarioSetResultBudgetStatus, SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES} from './scenario-set-budget.js';
import {combineScenarioLabClarification, interpretScenarioLabPrompt, validateScenarioLabIntent} from './scenario-lab-intent.js';
import {canonicalScenarioLabJson, createScenarioLabArchive, sha256ScenarioLabJson, validateScenarioLabArchive, validateScenarioLabResultBinding} from './scenario-lab-integrity.js';
import {normalizeWorkerResponse, WORKER_PROTOCOL_VERSION} from './worker-protocol.js';

const $ = id => document.getElementById(id);
const MAX_VISIBLE_ANIMALS = 1200;
const COLORS = ['#397f9c', '#65a8c5', '#8fbfce', '#66a68b', '#c39a69', '#947faf', '#cf8076', '#7d96b3', '#93a765', '#d28fa5'];

let reviewedManifest = null;
let reviewedManifestSha256 = null;
let completedResult = null;
let lastArchive = null;
let replayExpectation = null;
let requestSourcePrompt = null;
let requestIntent = null;
let requestRelationship = 'structured-only';
let pendingClarificationPrompt = null;
let applyingPromptIntent = false;
let selectedDayIndex = 0;
let visibleAnimals = MAX_VISIBLE_ANIMALS;
let selectedAnimalId = null;
let activeWorker = null;
let cancelActiveRun = null;
let reviewedBrCorteManifest = null;
let brCorteResult = null;
let reviewedBrCorteSensitivityManifest = null;
let brCorteSensitivityResult = null;

function status(message) {
  $('lab-status').textContent = message;
  clearTimeout(status.timer);
  status.timer = setTimeout(() => {
    if (!activeWorker) $('lab-status').textContent = '';
  }, 5000);
}

function parseNumber(value, field, min, max, integer = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`${field} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  }
  return number;
}

function createManifest(form) {
  const formData = new FormData(form);
  const animalCount = parseNumber(formData.get('animalCount'), 'Animals', 1, 10000, true);
  const durationDays = parseNumber(formData.get('durationDays'), 'Duration', 1, 365, true);
  const baselineSupplement = parseNumber(formData.get('baselineSupplement'), 'Baseline supplement', 0, 4);
  const seed = parseNumber(formData.get('seed'), 'Seed', 0, 0xffffffff, true);
  const levelsText = String(formData.get('alternativeLevels') ?? '');
  const levels = levelsText.split(/[,;\s]+/).filter(Boolean).map((value, index) => parseNumber(value, `Alternative ${index + 1}`, 0, 4));
  if (levels.length < 2 || levels.length > 9) throw new Error('Enter 2 to 9 alternative supplement levels.');
  if (new Set([baselineSupplement, ...levels]).size !== levels.length + 1) throw new Error('Every alternative must use a distinct supplement level, different from baseline.');

  const engine = new FarmEngine(seed, animalCount);
  const baselineConfig = {...engine.snapshot().config, supplement: baselineSupplement, weather: formData.get('weather')};
  engine.configure(baselineConfig);
  const snapshot = engine.snapshot();
  const scenarios = [{
    id: 'baseline', label: `Baseline · ${baselineSupplement} kg DM/head/day`, role: 'baseline', config: {...baselineConfig},
  }, ...levels.map((level, index) => ({
    id: `alternative-${index + 1}`,
    label: `Scenario ${String.fromCharCode(65 + index)} · ${level} kg DM/head/day`,
    role: 'intervention',
    config: {...baselineConfig, supplement: level},
  }))];
  return createScenarioSetManifest({snapshot, durationDays, scenarioId: `supplement-sweep-${seed}`, scenarios});
}

function renderReview(manifest) {
  $('review-panel').hidden = false;
  $('review-state').dataset.state = 'review';
  $('review-state').textContent = 'Requires confirmation';
  $('review-meta').textContent = `${manifest.durationDays} days · ${manifest.initialSnapshot.animals.length.toLocaleString()} generated engine animals · seed ${manifest.seed} · one factor: supplementation`;
  const budget = scenarioSetResultBudgetStatus({animalCount: manifest.initialSnapshot.animals.length, durationDays: manifest.durationDays, scenarioCount: manifest.scenarios.length});
  const size = bytes => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  $('resource-budget').textContent = budget.withinBudget
    ? `Estimated result JSON ${size(budget.estimatedBytes)} / ${size(SCENARIO_SET_PROJECTED_JSON_BUDGET_BYTES)} planning limit. ${budget.source}`
    : `This combination is over the ${size(budget.budgetBytes)} estimated-result planning limit (${size(budget.estimatedBytes)} projected). Reduce animals, duration or scenario arms, then review again. ${budget.source}`;
  $('resource-budget').dataset.withinBudget = String(budget.withinBudget);
  $('run-scenarios').disabled = !budget.withinBudget;
  const host = $('scenario-list');
  host.replaceChildren(...manifest.scenarios.map(scenario => {
    const article = document.createElement('article');
    const name = document.createElement('span');
    name.textContent = scenario.label;
    const details = document.createElement('strong');
    details.textContent = `${scenario.config.weather} · ${scenario.config.housing} · ${scenario.config.diet}`;
    article.append(name, details);
    return article;
  }));
}

function requestScenarioSet(manifest, manifestSha256) {
  if (activeWorker) return Promise.reject(new Error('A scenario set is already running.'));
  const worker = new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});
  activeWorker = worker;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      worker.terminate();
      if (activeWorker === worker) activeWorker = null;
      if (cancelActiveRun === cancel) cancelActiveRun = null;
      $('cancel-run').hidden = true;
    };
    const cancel = () => {
      cleanup();
      reject(new Error('Scenario run cancelled. The reviewed manifest is ready to run again.'));
    };
    const onMessage = event => {
      try {
        const response = normalizeWorkerResponse(event.data);
        if (response.type === 'progress') {
          const arm = response.scenarioId ? ` · scenario ${response.scenarioIndex}/${response.scenarioCount}` : '';
          $('lab-status').textContent = `Calculating${arm} · day ${response.day} of ${response.days}`;
          return;
        }
        cleanup();
        if (response.type === 'error') reject(new Error(response.error.message));
        else if (response.type === 'scenarioSet') resolve(response);
        else reject(new Error('Unexpected Worker response.'));
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onError = event => {
      cleanup();
      reject(new Error(event.message || 'Scenario Worker failed.'));
    };
    cancelActiveRun = cancel;
    $('cancel-run').hidden = false;
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError, {once: true});
    try {
      worker.postMessage({protocolVersion: WORKER_PROTOCOL_VERSION, type: 'replayScenarioSet', manifest, manifestSha256});
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function activePopulationScenario() {
  if (!completedResult) return null;
  const selectedId = $('population-scenario').value;
  return selectedId === completedResult.baseline.id
    ? completedResult.baseline
    : completedResult.scenarios.find(scenario => scenario.id === selectedId) ?? completedResult.baseline;
}

function allScenarios() {
  return completedResult ? [completedResult.baseline, ...completedResult.scenarios] : [];
}

function renderScenarioPicker() {
  const select = $('population-scenario');
  select.replaceChildren(...allScenarios().map(scenario => {
    const option = document.createElement('option');
    option.value = scenario.id;
    option.textContent = scenario.label;
    return option;
  }));
}

function renderChart() {
  const host = $('scenario-chart');
  const scenarios = allScenarios();
  if (!scenarios.length) return;
  const width = 760, height = 210, pad = {left: 48, right: 16, top: 12, bottom: 26};
  const rows = scenarios.map(scenario => scenario.rows);
  const values = rows.flatMap(series => series.map(row => row.meanWeightKg));
  const low = Math.min(...values), high = Math.max(...values), range = Math.max(high - low, 0.1);
  const points = rows[0].length;
  const x = index => pad.left + (width - pad.left - pad.right) * index / Math.max(1, points - 1);
  const y = value => height - pad.bottom - (value - low) / range * (height - pad.top - pad.bottom);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (let tick = 0; tick <= 2; tick++) {
    const value = low + range * tick / 2;
    const py = y(value);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', pad.left); line.setAttribute('x2', width - pad.right);
    line.setAttribute('y1', py); line.setAttribute('y2', py); line.setAttribute('stroke', '#e8eef0');
    svg.append(line);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', pad.left - 8); label.setAttribute('y', py + 3);
    label.setAttribute('text-anchor', 'end'); label.setAttribute('font-size', '9'); label.setAttribute('fill', '#8d9b9f');
    label.textContent = value.toFixed(1);
    svg.append(label);
  }
  scenarios.forEach((scenario, scenarioIndex) => {
    const path = scenario.rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(row.meanWeightKg).toFixed(2)}`).join(' ');
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', path); line.setAttribute('fill', 'none');
    line.setAttribute('stroke', COLORS[scenarioIndex % COLORS.length]); line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round');
    svg.append(line);
  });
  host.replaceChildren(svg);
  const legend = $('scenario-legend');
  legend.replaceChildren(...scenarios.map((scenario, index) => {
    const item = document.createElement('span'), swatch = document.createElement('i');
    swatch.style.backgroundColor = COLORS[index % COLORS.length];
    item.append(swatch, document.createTextNode(scenario.label));
    return item;
  }));
}

function currentPoint(scenario) {
  return scenario?.timeline[selectedDayIndex] ?? scenario?.timeline.at(-1) ?? null;
}

function renderPopulation() {
  const scenario = activePopulationScenario();
  const point = currentPoint(scenario);
  const host = $('scenario-population');
  if (!point) { host.replaceChildren(); return; }
  const animals = point.animals;
  const weights = animals.map(animal => animal.weight);
  const low = Math.min(...weights), high = Math.max(...weights);
  const cells = animals.slice(0, visibleAnimals).map(animal => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `scenario-animal-cell${animal.id === selectedAnimalId ? ' selected' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-selected', String(animal.id === selectedAnimalId));
    cell.setAttribute('aria-label', `Animal ${animal.id}, ${animal.weight.toFixed(1)} kilograms on day ${point.day}`);
    cell.title = `Animal ${animal.id} · ${animal.weight.toFixed(1)} kg · day ${point.day}`;
    const ratio = high === low ? 0.5 : (animal.weight - low) / (high - low);
    cell.style.backgroundColor = `hsl(${200 - 24 * ratio} 44% ${92 - ratio * 28}%)`;
    cell.addEventListener('click', () => { selectedAnimalId = animal.id; renderPopulation(); renderAnimalDetail(); });
    cell.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 12 : -12;
      const index = animals.findIndex(item => item.id === animal.id);
      const next = animals[Math.max(0, Math.min(animals.length - 1, index + step))];
      if (next) { selectedAnimalId = next.id; renderPopulation(); renderAnimalDetail(); host.querySelector(`[aria-label^="Animal ${selectedAnimalId},"]`)?.focus(); }
    });
    return cell;
  });
  host.replaceChildren(...cells);
  $('cell-count').textContent = `${Math.min(animals.length, visibleAnimals).toLocaleString()} / ${animals.length.toLocaleString()} cells`;
  $('population-count').textContent = `${animals.length.toLocaleString()} engine animals · day ${point.day}`;
  $('show-more-cells').hidden = animals.length <= visibleAnimals;
  $('show-more-cells').textContent = `Show more (${Math.min(animals.length - visibleAnimals, MAX_VISIBLE_ANIMALS).toLocaleString()})`;
}

function renderAnimalDetail() {
  const scenario = activePopulationScenario();
  const point = currentPoint(scenario);
  const animal = point?.animals.find(item => item.id === selectedAnimalId);
  if (!animal) {
    $('animal-detail').textContent = 'Select an animal cell to inspect its returned state.';
    return;
  }
  $('animal-detail').textContent = `Animal ${animal.id} · ${animal.name} · initial weight ${animal.initialWeight.toFixed(1)} kg · day ${point.day} weight ${animal.weight.toFixed(1)} kg · activity ${animal.action}. These are illustrative engine states.`;
}

function renderTable() {
  const scenarios = allScenarios();
  const head = $('scenario-table-head'), body = $('scenario-table-body');
  const headings = ['Day', ...scenarios.map(scenario => `${scenario.label} · kg`)];
  head.replaceChildren();
  const row = document.createElement('tr');
  for (const text of headings) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; row.append(th); }
  head.append(row);
  const baselineRows = completedResult.baseline.rows;
  const rows = baselineRows.map((baseRow, index) => {
    const tr = document.createElement('tr');
    const selectedDay = completedResult.baseline.timeline[selectedDayIndex].day;
    tr.dataset.selected = String(baseRow.day === selectedDay);
    const cells = [baseRow.day, ...scenarios.map(scenario => scenario.rows[index].meanWeightKg.toFixed(1))];
    for (const value of cells) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
    return tr;
  });
  body.replaceChildren(...rows);
}

function renderProvenance() {
  const details = $('scenario-provenance');
  const lines = [
    `Executor: ${completedResult.executor}.`,
    `Engine: ${completedResult.engineVersion}. Experiment set: ${completedResult.scenarioId}; seed ${completedResult.seed}; ${completedResult.durationDays} days; factor ${completedResult.factor}.`,
    'Every intervention was compared against the same cloned baseline snapshot. The baseline output is stored once in the result projection.',
    'Animal identities, weights and actions are outputs of the deterministic illustrative FarmEngine, not observed cattle.',
    `Units: ${completedResult.units.meanWeightKg}; herd feed ${completedResult.units.cumulativeFeedIntakeKgDM}; ${completedResult.units.cumulativeCostUnits}; ${completedResult.units.pastureStockKgDM}.`,
    `Illustrative engine assumptions: ${Object.entries(completedResult.assumptions).map(([key, value]) => `${key}=${value}`).join(', ')}.`,
    `Request provenance: ${lastArchive.request.relationship}; hypothesis status: ${lastArchive.provenance.hypothesis.status}.`,
    `Confirmed and executed manifest SHA-256: ${lastArchive.provenance.confirmedManifestSha256}; results SHA-256: ${lastArchive.provenance.resultsSha256}.`,
    `Scientific model: ${lastArchive.provenance.scientificModel.status}; no BR-CORTE equation was used.`,
    'No result is independently validated as a weight, intake, activity, weather, pasture or economic prediction. BR-CORTE is not used by this run.',
  ];
  const list = document.createElement('ul');
  list.replaceChildren(...lines.map(line => { const item = document.createElement('li'); item.textContent = line; return item; }));
  details.replaceChildren(list);
}

function renderResults(result) {
  completedResult = result;
  selectedDayIndex = 0;
  visibleAnimals = MAX_VISIBLE_ANIMALS;
  const checkpoints = result.baseline.timeline;
  $('results').hidden = false;
  $('run-meta').textContent = `${result.scenarios.length + 1} scenarios · ${result.executionCount} intervention executions · ${result.executor} · ${result.engineVersion}`;
  $('result-day').max = String(checkpoints.length - 1);
  $('result-day').value = '0';
  $('result-checkpoints').replaceChildren(...checkpoints.map(point => { const item = document.createElement('span'); item.textContent = String(point.day); return item; }));
  $('selected-day').textContent = String(checkpoints[0].day);
  renderScenarioPicker();
  $('population-scenario').value = result.scenarios[0]?.id ?? result.baseline.id;
  renderChart(); renderTable(); renderPopulation(); renderAnimalDetail(); renderProvenance();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('results').scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
}

$('scenario-form').addEventListener('submit', event => {
  event.preventDefault();
  void (async () => {
    try {
      reviewedManifest = createManifest(event.currentTarget);
      reviewedManifestSha256 = await sha256ScenarioLabJson(reviewedManifest);
      lastArchive = null;
      replayExpectation = null;
      renderReview(reviewedManifest);
      $('results').hidden = true;
      completedResult = null;
      status('Review the shared snapshot, seed and intervention levels before running.');
    } catch (error) {
      reviewedManifest = null;
      reviewedManifestSha256 = null;
      $('review-panel').hidden = true;
      $('review-state').dataset.state = 'error';
      $('review-state').textContent = 'Review failed';
      status(error.message);
    }
  })();
});

$('scenario-form').addEventListener('input', event => {
  if (applyingPromptIntent || activeWorker || event.target.type === 'submit') return;
  if (requestIntent) {
    requestIntent = null;
    requestRelationship = 'manual-revision';
  }
  reviewedManifest = null;
  reviewedManifestSha256 = null;
  $('review-panel').hidden = true;
  $('results').hidden = true;
  completedResult = null;
  lastArchive = null;
  replayExpectation = null;
  status('Inputs changed. Review the updated scenario set before running.');
});

$('run-scenarios').addEventListener('click', async () => {
  if (!reviewedManifest || activeWorker) return;
  const budget = scenarioSetResultBudgetStatus({animalCount: reviewedManifest.initialSnapshot.animals.length, durationDays: reviewedManifest.durationDays, scenarioCount: reviewedManifest.scenarios.length});
  if (!budget.withinBudget) { status('This scenario set exceeds the estimated-result resource budget. Reduce animals, duration or arms.'); return; }
  const manifest = structuredClone(reviewedManifest);
  const manifestSha256 = reviewedManifestSha256;
  $('prompt-result').textContent = 'The reviewed scenario set is running in the FarmEngine Worker.';
  $('review-state').dataset.state = 'running';
  $('review-state').textContent = 'Running confirmed inputs';
  $('run-scenarios').disabled = true;
  status(`Verifying the approved manifest, then running ${manifest.scenarios.length} scenarios…`);
  try {
    if (!manifestSha256 || await sha256ScenarioLabJson(manifest) !== manifestSha256) throw new Error('Reviewed inputs changed after confirmation. Review the scenario set again.');
    const response = await requestScenarioSet(manifest, manifestSha256);
    if (response.manifestSha256 !== manifestSha256) throw new Error('Worker execution digest does not match the confirmed manifest.');
    const result = response.data;
    validateScenarioLabResultBinding(manifest, result);
    if (replayExpectation && canonicalScenarioLabJson(result) !== canonicalScenarioLabJson(replayExpectation)) {
      throw new Error('Recalculated output does not match the exported result. The recovered run was withheld.');
    }
    lastArchive = await createScenarioLabArchive({
      manifest,
      results: result,
      sourcePrompt: requestSourcePrompt,
      intent: requestIntent,
      relationship: requestRelationship,
      executedManifestSha256: response.manifestSha256,
    });
    replayExpectation = null;
    renderResults(result);
    $('review-state').dataset.state = 'complete';
    $('review-state').textContent = 'Completed · reproducible';
    $('prompt-result').textContent = 'The reviewed scenario set completed. These are illustrative FarmEngine outputs; the prompt parser did not calculate them.';
    status('Scenario set complete. The Worker inputs match the reviewed manifest and the result is bound to its seed and executor.');
  } catch (error) {
    $('review-state').dataset.state = error.message.includes('cancelled') ? 'cancelled' : 'error';
    $('review-state').textContent = error.message.includes('cancelled') ? 'Cancelled · no partial result' : 'Run not accepted';
    $('prompt-result').textContent = error.message.includes('cancelled')
      ? 'Scenario run cancelled. No partial result was created; the reviewed inputs are still available.'
      : `Scenario run failed: ${error.message}`;
    status(error.message);
  } finally {
    $('run-scenarios').disabled = false;
    $('cancel-run').hidden = true;
  }
});

$('cancel-run').addEventListener('click', () => {
  if (cancelActiveRun) cancelActiveRun();
});

$('result-day').addEventListener('input', event => {
  if (!completedResult) return;
  selectedDayIndex = Number(event.target.value);
  $('selected-day').textContent = String(completedResult.baseline.timeline[selectedDayIndex].day);
  renderTable(); renderPopulation(); renderAnimalDetail();
});

$('population-scenario').addEventListener('change', () => { renderPopulation(); renderAnimalDetail(); });
$('show-more-cells').addEventListener('click', () => { visibleAnimals += MAX_VISIBLE_ANIMALS; renderPopulation(); });
$('export-results').addEventListener('click', () => {
  if (!lastArchive || !completedResult) return;
  const blob = new Blob([JSON.stringify(lastArchive, null, 2)], {type: 'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `${lastArchive.manifest.scenarioId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
});

$('load-manifest').addEventListener('click', () => $('manifest-file').click());
$('manifest-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  reviewedManifest = null;
  reviewedManifestSha256 = null;
  completedResult = null;
  lastArchive = null;
  replayExpectation = null;
  requestSourcePrompt = null;
  requestIntent = null;
  requestRelationship = 'structured-only';
  $('review-panel').hidden = true;
  $('results').hidden = true;
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('Saved experiment JSON must be 4 MB or smaller.');
    const saved = JSON.parse(await file.text());
    const archive = saved?.type === 'riose-scenario-lab-archive' ? await validateScenarioLabArchive(saved) : null;
    const manifest = saved?.manifest;
    validateScenarioSetManifest(manifest);
    if (saved?.results) validateScenarioLabResultBinding(manifest, saved.results);
    reviewedManifest = structuredClone(manifest);
    reviewedManifestSha256 = await sha256ScenarioLabJson(reviewedManifest);
    replayExpectation = saved?.results ? structuredClone(saved.results) : null;
    lastArchive = null;
    requestSourcePrompt = archive?.request.sourcePrompt ?? null;
    requestIntent = archive?.request.intent ?? null;
    requestRelationship = archive?.request.relationship ?? 'legacy-import';
    completedResult = null;
    $('results').hidden = true;
    renderReview(reviewedManifest);
    status(archive ? 'Archive hashes verified. Review the original inputs, then explicitly recalculate and compare the stored result.' : 'Saved manifest loaded. Review it, then run to recalculate and verify any stored result.');
  } catch (error) {
    reviewedManifest = null;
    reviewedManifestSha256 = null;
    replayExpectation = null;
    $('review-panel').hidden = true;
    $('review-state').dataset.state = 'error';
    $('review-state').textContent = 'Import rejected';
    status(`Could not open saved experiment: ${error.message}`);
  } finally {
    input.value = '';
  }
});

const promptExample = 'Compare supplement levels 0.5 kg DM/head/day, 1.0 kg DM/head/day, and 1.5 kg DM/head/day for 200 cattle over 30 days in hot weather.';
$('fill-prompt-example').addEventListener('click', () => {
  $('scenario-prompt').value = promptExample;
  pendingClarificationPrompt = null;
  requestSourcePrompt = null;
  requestIntent = null;
  requestRelationship = 'structured-only';
  if (reviewedManifest) {
    reviewedManifest = null;
    reviewedManifestSha256 = null;
    $('review-panel').hidden = true;
  }
  $('scenario-prompt').focus();
  $('prompt-result').textContent = 'Example loaded. Draft it to create a new review; no run has started.';
});
$('scenario-prompt').addEventListener('input', () => {
  $('prompt-result').textContent = pendingClarificationPrompt
    ? 'Add the missing details or restate the complete request, then draft again. The prior text is only context; nothing runs automatically.'
    : '';
  if (reviewedManifest) {
    reviewedManifest = null;
    reviewedManifestSha256 = null;
    $('review-panel').hidden = true;
    $('review-state').dataset.state = 'review';
    $('review-state').textContent = 'Request changed · review again';
    requestIntent = null;
    requestRelationship = requestSourcePrompt ? 'manual-revision' : 'structured-only';
    status('The request changed after review. Draft and review it again before a new run.');
  }
});
$('draft-scenario').addEventListener('click', () => {
  const result = $('prompt-result');
  result.className = 'prompt-result';
  try {
    const enteredText = $('scenario-prompt').value;
    const prompt = pendingClarificationPrompt
      ? combineScenarioLabClarification(pendingClarificationPrompt, enteredText)
      : enteredText;
    const intent = interpretScenarioLabPrompt(prompt);
    validateScenarioLabIntent(intent);
    if (!intent.ready) {
      pendingClarificationPrompt = intent.missingInputs.length && !intent.unsupportedRequests.length ? prompt : null;
      requestSourcePrompt = pendingClarificationPrompt;
      requestIntent = null;
      requestRelationship = pendingClarificationPrompt ? 'clarification-pending' : 'manual-revision';
      $('review-state').dataset.state = 'error';
      $('review-state').textContent = 'Clarification required';
      result.classList.add('needs-input');
      result.textContent = [
        intent.missingInputs.length ? `Please specify: ${intent.missingInputs.join(', ')}.` : '',
        intent.unsupportedRequests.join(' '),
        'Add the missing details or restate the full request. This deterministic parser does not execute or invent missing scientific inputs.',
      ].filter(Boolean).join(' ');
      return;
    }
    pendingClarificationPrompt = null;
    requestSourcePrompt = prompt;
    requestIntent = intent;
    requestRelationship = 'validated-prompt-draft';
    const form = $('scenario-form');
    applyingPromptIntent = true;
    form.elements.animalCount.value = String(intent.population.count);
    form.elements.durationDays.value = String(intent.duration.days);
    form.elements.baselineSupplement.value = String(intent.supplementLevelsKgDMPerHeadPerDay[0]);
    form.elements.alternativeLevels.value = intent.supplementLevelsKgDMPerHeadPerDay.slice(1).join(', ');
    form.elements.weather.value = intent.weather;
    form.dispatchEvent(new Event('input', {bubbles: true}));
    form.requestSubmit();
    applyingPromptIntent = false;
    const assumptions = intent.assumptions.filter(item => item.origin === 'scenario-lab default')
      .map(item => `${item.field}: ${item.value} (${item.origin})`);
    result.classList.add('draft-ready');
    result.textContent = `Draft prepared from the request. ${intent.population.count} animals · ${intent.duration.days} days · supplement levels ${intent.supplementLevelsKgDMPerHeadPerDay.join(', ')} kg DM/head/day. ${assumptions.length ? `Assumption: ${assumptions.join('; ')}. ` : ''}No simulation was run. Review the structured settings and confirm explicitly.`;
  } catch (error) {
    applyingPromptIntent = false;
    result.classList.add('needs-input');
    result.textContent = error.message;
    $('review-state').dataset.state = 'error';
    $('review-state').textContent = 'Draft rejected';
  }
});

function createBrCorteManifest(form) {
  const values = new FormData(form);
  const parse = (name, label, min, max, integer = false) => {
    const value = Number(values.get(name));
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      throw new Error(`${label} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
    }
    return value;
  };
  const rawPrice = String(values.get('supplementPrice') ?? '').trim();
  const rawCurrency = String(values.get('currency') ?? '').trim().toUpperCase();
  const levels = String(values.get('supplementLevels') ?? '').split(/[,;\s]+/).filter(Boolean).map((value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Supplement level ${index + 1} must be numeric.`);
    return number;
  });
  return createBrCorteDmiScenarioManifest({
    bodyWeightKg: parse('bodyWeightKg', 'Body weight', 133, 474),
    adgKgPerDay: parse('adgKgPerDay', 'Supplied average daily gain', -0.18, 1.34),
    animalCount: parse('animalCount', 'Animals', 1, 10000, true),
    durationDays: parse('durationDays', 'Duration', 1, 365, true),
    supplementLevelsKgDMPerHeadPerDay: levels,
    supplementPricePerKgDM: rawPrice === '' ? null : Number(rawPrice),
    currency: rawPrice === '' ? null : rawCurrency,
  });
}

function renderBrCorteReview(manifest) {
  $('br-corte-review').hidden = false;
  const {inputs} = manifest;
  const costBasis = inputs.supplementPricePerKgDM === null ? 'cost omitted (no price supplied)' : `price ${inputs.currency} ${inputs.supplementPricePerKgDM}/kg DM`;
  $('br-corte-review-meta').textContent = `${inputs.animalCount.toLocaleString()} represented animals · ${inputs.durationDays} days · BW ${inputs.bodyWeightKg} kg · supplied ADG ${inputs.adgKgPerDay} kg/day · ${costBasis}`;
  $('br-corte-review-list').replaceChildren(...inputs.supplementLevelsKgDMPerHeadPerDay.map((level, index) => {
    const article = document.createElement('article');
    const label = document.createElement('span'); label.textContent = index === 0 ? 'Baseline' : `Scenario ${String.fromCharCode(64 + index)}`;
    const value = document.createElement('strong'); value.textContent = `${level} kg DM/head/day`;
    article.append(label, value); return article;
  }));
}

function renderBrCorteResults(result) {
  const head = $('br-corte-table-head'); const body = $('br-corte-table-body');
  const headings = ['Scenario', 'Supplement · kg DM/head/day', 'Total DMI · kg DM/head/day', 'Herd total · kg DM', 'Supplement total · kg DM', ...(result.scenarios[0].totals.supplementCost === null ? [] : ['Supplement cost'])];
  const tr = document.createElement('tr');
  for (const text of headings) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; tr.append(th); }
  head.replaceChildren(tr);
  body.replaceChildren(...result.scenarios.map(scenario => {
    const row = document.createElement('tr');
    const values = [scenario.label, scenario.input.supplementKgDMPerHeadPerDay.toFixed(2), scenario.outputs.totalDmiKgDMPerHeadPerDay.toFixed(3), scenario.totals.herdDmiKgDM.toFixed(1), scenario.totals.supplementKgDM.toFixed(1), ...(scenario.totals.supplementCost === null ? [] : [`${scenario.totals.currency} ${scenario.totals.supplementCost.toFixed(2)}`])];
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    return row;
  }));
  const lines = [
    `${result.model.id}@${result.model.version}; ${result.model.equation}.`,
    `Application domain: ${result.model.applicationDomain}. Published input ranges: BW ${result.model.publishedInputRanges.bodyWeightKg.join('–')} kg, supplied ADG ${result.model.publishedInputRanges.adgKgPerDay.join('–')} kg/day, supplement ${result.model.publishedInputRanges.supplementKgDMPerDay.join('–')} kg DM/day.`,
    'Published validation in the BR-CORTE chapter: 174 Zebu experimental units, R² 0.670, mean bias +0.761 kg/day, CCC 0.741. This is source-reported validation, not Riose calibration or validation.',
    'BR-CORTE 2023, Chapter 2: Table 2.14 worked example; development fit (R² 0.638, 1,069 experimental units) is not independent validation. The model estimates total intake conditional on supplied ADG; it does not forecast gain.',
    'Inputs are treated as representative and constant. Herd totals are arithmetic multiplication, not a cohort distribution. The supplement input is already DM. No forage intake observation, gain trajectory, uncertainty interval, or profit is produced.',
    ...result.scenarios.map(scenario => `${scenario.label}: implementation hash ${scenario.provenance.implementationHash}; evidence classification ${scenario.provenance.evidenceStatus}.`),
  ];
  const list = document.createElement('ul');
  list.replaceChildren(...lines.map(line => { const item = document.createElement('li'); item.textContent = line; return item; }));
  $('br-corte-provenance').replaceChildren(list);
  $('br-corte-results').hidden = false;
}

function resetBrCorteSensitivity() {
  reviewedBrCorteSensitivityManifest = null;
  brCorteSensitivityResult = null;
  $('br-corte-sensitivity-review').hidden = true;
  $('br-corte-sensitivity-results').hidden = true;
}

function createBrCorteSensitivityFromForms() {
  const scenario = new FormData($('br-corte-form'));
  const sweep = new FormData($('br-corte-sensitivity-form'));
  const rawPrice = String(scenario.get('supplementPrice') ?? '').trim();
  return createBrCorteSensitivityManifest({
    bodyWeightKg: Number(scenario.get('bodyWeightKg')),
    adgKgPerDay: Number(scenario.get('adgKgPerDay')),
    animalCount: Number(scenario.get('animalCount')),
    durationDays: Number(scenario.get('durationDays')),
    minimumSupplementKgDMPerHeadPerDay: Number(sweep.get('minimumSupplement')),
    maximumSupplementKgDMPerHeadPerDay: Number(sweep.get('maximumSupplement')),
    stepKgDMPerHeadPerDay: Number(sweep.get('sweepStep')),
    supplementPricePerKgDM: rawPrice === '' ? null : Number(rawPrice),
    currency: rawPrice === '' ? null : String(scenario.get('currency') ?? '').trim().toUpperCase(),
  });
}

function renderBrCorteSensitivityReview(manifest) {
  const {inputs} = manifest;
  $('br-corte-sensitivity-review-meta').textContent = `${inputs.sweep.values.length} calculated points · ${inputs.animalCount.toLocaleString()} represented animals · ${inputs.durationDays} days · BR-CORTE Eq. 2.6`;
  const price = inputs.supplementPricePerKgDM === null ? 'cost omitted · no price supplied' : `${inputs.currency} ${inputs.supplementPricePerKgDM}/kg DM`;
  const lines = [
    ['Fixed body weight', `${inputs.bodyWeightKg} kg`],
    ['Fixed supplied ADG', `${inputs.adgKgPerDay} kg/day · input, not predicted`],
    ['Supplement input sweep', `${inputs.sweep.minimum}–${inputs.sweep.maximum} by ${inputs.sweep.step} kg DM/head/day`],
    ['Cost basis', price],
  ];
  $('br-corte-sensitivity-review-list').replaceChildren(...lines.map(([label, value]) => {
    const article = document.createElement('article');
    const name = document.createElement('span'); name.textContent = label;
    const detail = document.createElement('strong'); detail.textContent = value;
    article.append(name, detail); return article;
  }));
  $('br-corte-sensitivity-review').hidden = false;
}

function renderBrCorteSensitivityResults(result) {
  const head = $('br-corte-sensitivity-table-head'); const body = $('br-corte-sensitivity-table-body');
  const headings = ['Supplement · kg DM/head/day', 'Total DMI · kg DM/head/day', 'Herd DMI total · kg DM', 'Supplement total · kg DM', ...(result.rows[0].supplementCost === null ? [] : ['Supplement cost'])];
  const header = document.createElement('tr');
  for (const label of headings) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; header.append(th); }
  head.replaceChildren(header);
  body.replaceChildren(...result.rows.map(row => {
    const tr = document.createElement('tr');
    const values = [row.supplementKgDMPerHeadPerDay.toFixed(2), row.totalDmiKgDMPerHeadPerDay.toFixed(3), row.herdTotalDmiKgDM.toFixed(1), row.supplementKgDM.toFixed(1), ...(row.supplementCost === null ? [] : [`${row.currency} ${row.supplementCost.toFixed(2)}`])];
    for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
    return tr;
  }));
  const xMin = result.rows[0].supplementKgDMPerHeadPerDay;
  const xMax = result.rows.at(-1).supplementKgDMPerHeadPerDay;
  const yValues = result.rows.map(row => row.totalDmiKgDMPerHeadPerDay);
  const yMin = Math.min(...yValues); const yMax = Math.max(...yValues);
  const left = 54; const right = 620; const top = 18; const bottom = 174;
  const x = value => left + ((value - xMin) / (xMax - xMin)) * (right - left);
  const y = value => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 660 220'); svg.setAttribute('aria-hidden', 'true');
  const axis = document.createElementNS(svg.namespaceURI, 'path'); axis.setAttribute('d', `M${left} ${top}V${bottom}H${right}`); axis.setAttribute('fill', 'none'); axis.setAttribute('stroke', '#dce7eb');
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('points', result.rows.map(row => `${x(row.supplementKgDMPerHeadPerDay)},${y(row.totalDmiKgDMPerHeadPerDay)}`).join(' '));
  line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#4b9cba'); line.setAttribute('stroke-width', '2.5'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round');
  svg.append(axis, line);
  for (const row of result.rows) {
    const point = document.createElementNS(svg.namespaceURI, 'circle');
    point.setAttribute('cx', String(x(row.supplementKgDMPerHeadPerDay))); point.setAttribute('cy', String(y(row.totalDmiKgDMPerHeadPerDay))); point.setAttribute('r', '3.5'); point.setAttribute('fill', '#147eaa');
    const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = `${row.supplementKgDMPerHeadPerDay} kg DM/head/day supplement → ${row.totalDmiKgDMPerHeadPerDay.toFixed(3)} kg DM/head/day total DMI`; point.append(title); svg.append(point);
  }
  const label = (text, tx, ty, anchor = 'middle') => { const node = document.createElementNS(svg.namespaceURI, 'text'); node.textContent = text; node.setAttribute('x', String(tx)); node.setAttribute('y', String(ty)); node.setAttribute('text-anchor', anchor); node.setAttribute('fill', '#75858c'); node.setAttribute('font-size', '10'); svg.append(node); };
  label(yMax.toFixed(3), left - 8, top + 4, 'end'); label(yMin.toFixed(3), left - 8, bottom + 4, 'end');
  label(`${xMin} kg DM/head/day`, left, 199, 'start'); label(`${xMax} kg DM/head/day`, right, 199, 'end');
  $('br-corte-sensitivity-chart').replaceChildren(svg);
  $('br-corte-sensitivity-chart').setAttribute('aria-label', `BR-CORTE total DMI sensitivity curve, ${result.rows.length} points. Horizontal axis supplement in kg dry matter per head per day from ${xMin} to ${xMax}. Vertical axis total DMI in kg dry matter per head per day from ${yMin.toFixed(3)} to ${yMax.toFixed(3)}.`);
  $('br-corte-sensitivity-summary').textContent = `Body weight ${result.fixedInputs.bodyWeightKg} kg and supplied ADG ${result.fixedInputs.adgKgPerDay} kg/day held constant. Exact equation derivative: ${result.localSensitivity.derivative} kg DMI per kg DM supplement, within the declared input domain.`;
  $('br-corte-sensitivity-provenance').textContent = `${result.model.id}@${result.model.version}. ${result.interpretation} ${result.model.evidenceStatus}. The equation does not predict gain; this is not measured intake.`;
  $('br-corte-sensitivity-results').hidden = false;
}

$('br-corte-form').addEventListener('submit', event => {
  event.preventDefault();
  resetBrCorteSensitivity();
  try {
    reviewedBrCorteManifest = createBrCorteManifest(event.currentTarget);
    brCorteResult = null;
    $('br-corte-results').hidden = true;
    renderBrCorteReview(reviewedBrCorteManifest);
    status('Review the BR-CORTE inputs and assumptions before calculating.');
  } catch (error) {
    reviewedBrCorteManifest = null;
    $('br-corte-review').hidden = true;
    status(error.message);
  }
});

$('br-corte-form').addEventListener('input', () => {
  resetBrCorteSensitivity();
  reviewedBrCorteManifest = null;
  brCorteResult = null;
  $('br-corte-review').hidden = true;
  $('br-corte-results').hidden = true;
});

$('br-corte-sensitivity-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    reviewedBrCorteSensitivityManifest = createBrCorteSensitivityFromForms();
    brCorteSensitivityResult = null;
    $('br-corte-sensitivity-results').hidden = true;
    renderBrCorteSensitivityReview(reviewedBrCorteSensitivityManifest);
    status('Review the BR-CORTE sensitivity inputs before calculating.');
  } catch (error) {
    resetBrCorteSensitivity();
    status(error.message);
  }
});

$('br-corte-sensitivity-form').addEventListener('input', resetBrCorteSensitivity);

$('br-corte-sensitivity-run').addEventListener('click', () => {
  if (!reviewedBrCorteSensitivityManifest) return;
  try {
    brCorteSensitivityResult = evaluateBrCorteSensitivityManifest(reviewedBrCorteSensitivityManifest);
    renderBrCorteSensitivityResults(brCorteSensitivityResult);
    status('BR-CORTE deterministic sensitivity calculated from the reviewed inputs.');
  } catch (error) {
    brCorteSensitivityResult = null;
    $('br-corte-sensitivity-results').hidden = true;
    status(error.message);
  }
});

$('br-corte-run').addEventListener('click', () => {
  if (!reviewedBrCorteManifest) return;
  try {
    brCorteResult = evaluateBrCorteDmiScenarioManifest(reviewedBrCorteManifest);
    renderBrCorteResults(brCorteResult);
    status('BR-CORTE conditional estimates calculated from the reviewed inputs.');
  } catch (error) {
    brCorteResult = null;
    $('br-corte-results').hidden = true;
    status(error.message);
  }
});

$('br-corte-export').addEventListener('click', () => {
  if (!reviewedBrCorteManifest || !brCorteResult) return;
  const blob = new Blob([JSON.stringify({manifest: reviewedBrCorteManifest, results: brCorteResult}, null, 2)], {type: 'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `${reviewedBrCorteManifest.modelId}-scenario-set-v1.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
});

$('br-corte-load').addEventListener('click', () => $('br-corte-file').click());
$('br-corte-file').addEventListener('change', async event => {
  const fileInput = event.currentTarget;
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('Saved BR-CORTE JSON must be 2 MB or smaller.');
    const saved = JSON.parse(await file.text());
    const manifest = saved?.manifest;
    validateBrCorteDmiScenarioManifest(manifest);
    const form = $('br-corte-form');
    form.elements.bodyWeightKg.value = String(manifest.inputs.bodyWeightKg);
    form.elements.adgKgPerDay.value = String(manifest.inputs.adgKgPerDay);
    form.elements.animalCount.value = String(manifest.inputs.animalCount);
    form.elements.durationDays.value = String(manifest.inputs.durationDays);
    form.elements.supplementLevels.value = manifest.inputs.supplementLevelsKgDMPerHeadPerDay.join(', ');
    form.elements.supplementPrice.value = manifest.inputs.supplementPricePerKgDM === null ? '' : String(manifest.inputs.supplementPricePerKgDM);
    form.elements.currency.value = manifest.inputs.currency ?? '';
    reviewedBrCorteManifest = manifest;
    brCorteResult = null;
    $('br-corte-results').hidden = true;
    renderBrCorteReview(manifest);
    status('Saved BR-CORTE inputs loaded and validated. Review, then calculate to reproduce the result.');
  } catch (error) {
    reviewedBrCorteManifest = null;
    $('br-corte-review').hidden = true;
    status(`Could not open saved BR-CORTE experiment: ${error.message}`);
  } finally {
    fileInput.value = '';
  }
});
