import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FarmEngine, createComparisonManifest, replayComparisonManifest} from '../src/client/engine.js';
import {resolveFieldEvidence} from '../scientific/evidence-resolver.js';

test('selected evidence adapter maps persisted states without promotion and retains source context', () => {
  const snapshot = {
    sourceCatalog: [{id: 'field-study', title: 'Field study', url: 'https://example.test/study', version: '2024'}],
    observations: [
      {path: 'animal.a1.weight', status: 'observed', sourceId: 'field-study', sourceLocator: 'Table 2', populationValidity: 'Nelore steers', period: '2024-01', observedAt: '2024-01-15'},
      {path: 'animal.a1.gain', status: 'derived', sourceId: 'field-study'},
      {path: 'animal.a1.target', status: 'hypothesis', sourceId: 'field-study'},
      {path: 'animal.a1.review', status: 'verified', sourceId: 'field-study'},
      {path: 'animal.a1.blank', status: 'missing'}
    ]
  };
  const cases = [
    ['animal.a1.weight', 'OBSERVED', 'observed'],
    ['animal.a1.gain', 'SIMULATED', 'derived'],
    ['animal.a1.target', 'ASSUMED', 'hypothesis'],
    ['animal.a1.review', 'MISSING', 'verified'],
    ['animal.a1.blank', 'MISSING', 'missing'],
    ['animal.a1.absent', 'MISSING', 'missing']
  ];

  for (const [path, state, status] of cases) {
    const evidence = resolveFieldEvidence(snapshot, path);
    assert.equal(evidence.state, state, path);
    assert.equal(evidence.status, status, path);
  }

  const observed = resolveFieldEvidence(snapshot, 'animal.a1.weight');
  assert.equal(observed.sourceId, 'field-study');
  assert.equal(observed.sourceLocator, 'Table 2');
  assert.equal(observed.population, 'Nelore steers');
  assert.equal(observed.period, '2024-01');
  assert.deepEqual(observed.source, {id: 'field-study', title: 'Field study', url: 'https://example.test/study', version: '2024'});
  assert.deepEqual(resolveFieldEvidence(snapshot, 'animal.a1.gain').freshness, {
    status: 'not-recorded', reason: 'Data de observação não registrada.'
  });
});

test('reconciled registry metadata leaves the legacy comparison manifest replay unchanged', () => {
  const engine = new FarmEngine(551, 5);
  engine.configure({housing: 'pasture', diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(48);
  const manifest = createComparisonManifest(engine.snapshot(), 17);
  const replay = replayComparisonManifest(manifest);
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

  assert.equal(hash(manifest), '3e4f06e6649cb327727ecf4571ddcf546a1e11796af0dbc1ba6f94863aa59410');
  assert.equal(hash(replay), 'aa77c8889e5cf13e720a08855d7d0d42847341bc7dfecdf707c56daf46acfbe6');
  assert.deepEqual(replayComparisonManifest(JSON.parse(JSON.stringify(manifest))), replay);
});
