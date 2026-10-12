import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveLotSelection, formatLotArea} from '../lot-selection.js';

const example = JSON.parse(await readFile(new URL('../schemas/examples/usda-cper-2019-paddock-19n-eartag-242.json', import.meta.url), 'utf8'));

test('visual paddock resolves only explicit snapshot links and preserves full entity IDs', () => {
  const snapshot = structuredClone(example);
  snapshot.paddocks[0].domainZoneId = 'paddock-1';
  snapshot.lots[0].paddockId = snapshot.paddocks[0].id;
  const selection = resolveLotSelection(snapshot, 'paddock-1');
  assert.equal(selection.paddock.id, '19N');
  assert.equal(selection.lots[0].lot.id, snapshot.lots[0].id);
  assert.deepEqual(selection.lots[0].animals.map(animal => animal.id), ['eartag-242']);
  assert.ok(selection.lots[0].fields.length >= 8);
  assert.equal(resolveLotSelection(snapshot, 'paddock-2'), null);

  delete snapshot.lots[0].paddockId;
  assert.deepEqual(resolveLotSelection(snapshot, 'paddock-1').lots, []);
});

test('area and missing fields remain explicit instead of becoming zero', () => {
  const missing = example.observations.find(field => field.path === 'paddock.19N.area_ha');
  assert.deepEqual(formatLotArea(missing), {value: 'Não informada', detail: missing.missingReason});
  assert.deepEqual(formatLotArea(null), {value: 'Não informada', detail: 'O snapshot não declara a área do piquete.'});
  assert.deepEqual(formatLotArea({value: 12.5, unit: 'ha', status: 'observed', sourceLocator: 'mapa'}), {value: '12,5 ha', detail: 'observed · mapa'});
});

test('snapshot with no lots still resolves its linked paddock as an explicit empty selection',()=>{
  const snapshot=structuredClone(example);snapshot.paddocks[0].domainZoneId='paddock-1';snapshot.lots=[];
  const selection=resolveLotSelection(snapshot,'paddock-1');
  assert.equal(selection.paddock.id,'19N');
  assert.deepEqual(selection.lots,[]);
});

test('area resolves from a linked lot or paddock observation and can use square metres',()=>{
  const snapshot=structuredClone(example);snapshot.paddocks[0].domainZoneId='paddock-1';snapshot.lots[0].paddockId='19N';
  snapshot.observations.push({path:`lot.${snapshot.lots[0].id}.area_m2`,value:24000,unit:'m²',status:'observed',sourceId:snapshot.sourceCatalog[0].id,sourceLocator:'survey',populationValidity:'lot area',measurementId:'lot-area-fixture',observedAt:'2019-01-01T00:00:00Z'});
  const selection=resolveLotSelection(snapshot,'paddock-1');
  assert.equal(selection.lots[0].area.value,24000);
  assert.equal(selection.lots[0].area.unit,'m²');
});
