import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmEngine, metrics} from '../src/client/engine.js';
import {combineLegacySnapshot, createAnimalViewStateDTO, separateLegacySnapshot} from '../src/client/animal-view-state.js';

test('engine keeps locomotion coordinates and RNG outside authoritative state', () => {
  const engine = new FarmEngine(417, 4);
  const animal = engine.state.animals[0];
  const view = engine.viewState.get(animal.id);

  assert.ok(view);
  assert.deepEqual(Object.keys(view), ['x', 'y', 'targetX', 'targetY']);
  assert.equal(Object.hasOwn(animal, 'x'), false);
  assert.equal(Object.hasOwn(animal, 'y'), false);
  assert.equal(Object.hasOwn(animal, 'targetX'), false);
  assert.equal(Object.hasOwn(animal, 'targetY'), false);
  assert.equal(Object.hasOwn(engine.state, 'locomotionSeed'), false);
  assert.equal(Number.isInteger(engine.viewState.locomotionSeed), true);
});

test('renderer DTO uses stable IDs and cannot mutate domain animals', () => {
  const engine = new FarmEngine(417, 4);
  const dto = createAnimalViewStateDTO(engine.state.animals, engine.viewState);
  const before = structuredClone(engine.state.animals);

  assert.deepEqual(dto.animals.map(animal => animal.id), engine.state.animals.map(animal => animal.id));
  assert.deepEqual(Object.keys(dto.animals[0]), ['id', 'name', 'action', 'x', 'y']);
  dto.animals[0].x = -1000;
  assert.deepEqual(engine.state.animals, before);
});

test('legacy snapshots split and recombine without changing their v1 representation', () => {
  const legacy = new FarmEngine(417, 4).snapshot();
  const separated = separateLegacySnapshot(legacy);

  assert.equal(Object.hasOwn(separated.state, 'locomotionSeed'), false);
  assert.equal(Object.hasOwn(separated.state.animals[0], 'x'), false);
  assert.deepEqual(combineLegacySnapshot(separated.state, separated.viewState), legacy);
});

test('changing view coordinates cannot alter scientific metrics or model RNG', () => {
  const engine = new FarmEngine(417, 4);
  const expectedMetrics = metrics(engine.state);
  const expectedSeed = engine.state.seed;

  engine.viewState.get(1).x += 500;
  engine.viewState.get(1).y -= 500;

  assert.deepEqual(metrics(engine.state), expectedMetrics);
  assert.equal(engine.state.seed, expectedSeed);
});

test('view-only draws and motion cannot change authoritative outcomes or scientific RNG order', () => {
  const reference = new FarmEngine(991, 12);
  const changedView = new FarmEngine(991, 12);
  const referenceState = structuredClone(reference.state);

  for (let draw = 0; draw < 37; draw++) changedView.viewState.random();
  for (const animal of changedView.state.animals) {
    const view = changedView.viewState.get(animal.id);
    view.x += 1000 + animal.id;
    view.y -= 500 + animal.id;
    view.targetX -= 300;
    view.targetY += 700;
  }
  assert.deepEqual(changedView.state, referenceState);

  changedView.tick(48);
  reference.tick(48);

  assert.deepEqual(changedView.state, reference.state);
  assert.deepEqual(metrics(changedView.state), metrics(reference.state));
  assert.deepEqual(changedView.state.events, reference.state.events);
  assert.equal(changedView.random(), reference.random());
  assert.notDeepEqual(changedView.snapshot().animals.map(({x,y})=>({x,y})),reference.snapshot().animals.map(({x,y})=>({x,y})));
});

test('legacy snapshots without visual coordinates reconstruct view state deterministically', () => {
  const legacy = new FarmEngine(417, 4).snapshot();
  delete legacy.locomotionSeed;
  for (const animal of legacy.animals) {
    delete animal.x;
    delete animal.y;
    delete animal.targetX;
    delete animal.targetY;
  }

  const first = FarmEngine.from(legacy);
  const second = FarmEngine.from(legacy);

  assert.equal(Object.hasOwn(first.state.animals[0], 'x'), false);
  assert.deepEqual(first.viewState.get(1), second.viewState.get(1));
  assert.ok(Object.values(first.viewState.get(1)).every(Number.isFinite));
  first.tick(24);
  second.tick(24);
  assert.deepEqual(first.state, second.state);
});

test('legacy snapshots remain deep copies of activity history after serialization', () => {
  const engine = new FarmEngine(417, 4);
  const snapshot = engine.snapshot();
  snapshot.animals[0].history[0].observed.thirst = -1;

  assert.equal(engine.state.animals[0].history[0].observed.thirst, 20);
});
