import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertSceneCommandAllowed, sceneExecutionAvailability, terminateNumericWorker, unavailableExecutionState} from '../graphics-poc/execution-eligibility.js';

const dairyScene = {
  simulation: {productionSystem: 'dairy', scenarioId: 'riose-dairy-composer-v1'},
  domainModule: {moduleId: 'livestock-dairy', version: '0.1.0', status: 'in-progress', modelIds: []}
};

test('in-progress, review, unsupported and candidate modules stay visual-only', () => {
  for (const status of ['in-progress', 'review', 'unsupported', 'candidate-integration']) {
    const scene = {...dairyScene, domainModule: {...dairyScene.domainModule, status}};
    const availability = sceneExecutionAvailability(scene);
    assert.equal(availability.available, false, status);
    assert.equal(availability.status, 'unavailable', status);
    assert.throws(() => assertSceneCommandAllowed(scene, 'tick'), /Execução numérica indisponível/);
  }
});

test('validated model execution requires a registered versioned model ID', () => {
  const scene = {...dairyScene, domainModule: {...dairyScene.domainModule, status: 'validated', modelIds: ['dairy-lactation@1.0.0']}};
  assert.equal(sceneExecutionAvailability(scene).available, false);
  assert.equal(sceneExecutionAvailability(scene, ['dairy-lactation@1.0.0']).available, true);
  assert.throws(() => assertSceneCommandAllowed(scene, 'compare'), /não registrado/);
  assert.doesNotThrow(() => assertSceneCommandAllowed(scene, 'tick', ['dairy-lactation@1.0.0']));
});

test('beef demo remains available but is explicitly classified as demonstrative', () => {
  const scene = {
    simulation: {productionSystem: 'beef'},
    domainModule: {moduleId: 'beef-demo', status: 'demonstrative-unvalidated', modelIds: ['beef-demo-weight-intake-v1']}
  };
  assert.deepEqual(sceneExecutionAvailability(scene), {
    available: true,
    status: 'demonstrative',
    reason: 'Motor demonstrativo, não validado cientificamente.',
    moduleId: 'beef-demo',
    moduleStatus: 'demonstrative-unvalidated',
    modelIds: ['beef-demo-weight-intake-v1']
  });
});

test('unavailable state is serializable without numeric outputs and the runtime gates Worker commands', async () => {
  const serialized = JSON.stringify(unavailableExecutionState(dairyScene));
  const state = JSON.parse(serialized);
  assert.equal(state.kind, 'numeric-execution-unavailable');
  assert.equal(state.moduleId, 'livestock-dairy');
  assert.equal(Object.hasOwn(state, 'outputs'), false);
  assert.equal(Object.hasOwn(state, 'results'), false);
  for (const command of ['reset', 'load', 'configure', 'select', 'tick', 'compare', 'replayComparison', 'snapshot']) {
    assert.throws(() => assertSceneCommandAllowed(dairyScene, command), /Execução numérica indisponível/, command);
  }

  const app = await readFile(new URL('../graphics-poc/app.js', import.meta.url), 'utf8');
  assert.match(app, /function askWorker\(message\) \{\s*assertSceneCommandAllowed\(state\.scene, message\.type\);/);
  assert.match(app, /import \{assertSceneCommandAllowed, sceneExecutionAvailability, terminateNumericWorker, unavailableExecutionState\}/);
  assert.match(app, /function setSimulationRunning\(value\)[\s\S]*?askWorker\(\{type: 'tick', hours: 1\}\)/,
    'periodic Worker ticks must pass through the same command gate');
  assert.doesNotMatch(app, /state\.worker\.postMessage\(\{type: 'tick'/,
    'no direct periodic tick may bypass askWorker');
  assert.match(app, /pending\.generation !== state\.sceneSelectionGeneration/,
    'late Worker responses from the previous scene must be discarded');
  assert.match(app, /\$\('run-simulation'\)\.disabled = !execution\.available/,
    'simulation UI actions must be disabled while execution is unavailable');
  assert.match(app, /EXECUÇÃO NUMÉRICA INDISPONÍVEL ·/,
    'the persistent engine badge must clearly classify visual-only scenes');
  assert.match(app, /Cena visual carregada · execução numérica indisponível/,
    'the UI must show an explicit unavailable state while preserving the scene');
  assert.match(app, /terminateNumericWorker\(state\.worker, state\.pending\); state\.worker = null/,
    'switching to a visual-only scene must stop an in-flight Worker and release pending requests');
  assert.match(app, /async function resetSimulation\(count = Number\(\$\('herd-size'\)\.value\)\) \{\s*if \(state\.selectedDomain !== 'beef'\) \{ assertSceneCommandAllowed\(state\.scene, 'reset'\); return; \}/,
    'programmatic reset calls must reject visual-only modules, even when UI controls are bypassed');
  assert.match(app, /async function runGraphicsBenchmark\([\s\S]*?assertSceneCommandAllowed\(state\.scene, 'reset'\);[\s\S]*?const ensureBeefBenchmark = \(\) => \{[\s\S]*?state\.selectedDomain !== 'beef'/,
    'benchmark entry and resumed async phases must recheck module eligibility');

  const dairy = JSON.parse(await readFile(new URL('../graphics-poc/scenes/dairy.json', import.meta.url), 'utf8'));
  assert.equal(dairy.domainModule.status, 'in-progress');
  assert.equal(sceneExecutionAvailability(dairy).available, false);
  assert.equal(dairy.simulation.initialConditions.layoutOnly, true);
  assert.equal(Object.hasOwn(dairy, 'outputs'), false);
  assert.equal(dairy.entities.length > 0, true, 'visual entities remain loadable while numeric execution is unavailable');
});

test('entering a visual-only scene terminates numeric work and releases pending async callers', () => {
  let terminated = 0;
  const worker = {terminate() { terminated++; }};
  const results = [];
  const pending = [
    {resolve(value) { results.push(value); }},
    {resolve(value) { results.push(value); }}
  ];
  terminateNumericWorker(worker, pending);
  assert.equal(terminated, 1);
  assert.deepEqual(pending, []);
  assert.deepEqual(results, [{type: 'stale'}, {type: 'stale'}]);
});
