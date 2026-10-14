import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveLotSelection, formatLotArea, resolveDemoLot, isolateDemoLotSnapshot, createDemoLotContext, validateDemoLotContext, DEMO_LOT_MODEL} from '../src/client/lot-selection.js';
import {FarmEngine} from '../src/client/engine.js';

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

test('a valid lot-specific area takes priority over the containing paddock area',()=>{
  const snapshot=structuredClone(example);snapshot.paddocks[0].domainZoneId='paddock-1';snapshot.lots[0].paddockId='19N';
  snapshot.observations.push({path:`paddock.19N.area_ha`,value:10,unit:'ha',status:'observed',sourceId:snapshot.sourceCatalog[0].id,sourceLocator:'paddock survey',populationValidity:'paddock area',measurementId:'paddock-area-fixture',observedAt:'2019-01-01T00:00:00Z'});
  snapshot.observations.push({path:`lot.${snapshot.lots[0].id}.area_m2`,value:24000,unit:'m²',status:'observed',sourceId:snapshot.sourceCatalog[0].id,sourceLocator:'lot survey',populationValidity:'lot area',measurementId:'lot-area-preferred-fixture',observedAt:'2019-01-01T00:00:00Z'});
  const selection=resolveLotSelection(snapshot,'paddock-1');
  assert.equal(selection.lots[0].area.value,24000);
  assert.equal(selection.lots[0].area.unit,'m²');
  assert.equal(selection.lots[0].area.sourceLocator,'lot survey');
});

test('registered demo lot IDs are stable and isolation preserves the shared snapshot without other paddock animals',()=>{
  const snapshot=new FarmEngine(88,12).snapshot(),before=structuredClone(snapshot);
  const lot=resolveDemoLot(snapshot,2),again=resolveDemoLot(snapshot,2);
  assert.equal(lot.lotId,'demo-paddock-3');
  assert.deepEqual(lot,again);
  assert.ok(lot.animalIds.length>0);
  const isolated=isolateDemoLotSnapshot(snapshot,lot);
  assert.deepEqual(isolated.animals.map(animal=>animal.id),lot.animalIds);
  assert.ok(isolated.animals.every(animal=>animal.patch===2));
  assert.equal(isolated.initialSeed,snapshot.initialSeed);
  assert.deepEqual(snapshot,before);
  assert.equal(resolveDemoLot(snapshot,9),null);
  assert.throws(()=>isolateDemoLotSnapshot(snapshot,{...lot,animalIds:[...lot.animalIds,999]}),/não correspondem/);
});

test('demo lot provenance records model evidence without claiming empirical validation',()=>{
  const snapshot=new FarmEngine(88,12).snapshot(),lot=resolveDemoLot(snapshot,1);
  const context=createDemoLotContext(lot,'diet',{diet:'pasture'},{diet:'balanced'});
  const isolated=isolateDemoLotSnapshot(snapshot,lot);
  assert.equal(context.model.evidenceStatus,'no_empirical_validation');
  assert.deepEqual(context.model.evidenceReferences,DEMO_LOT_MODEL.evidenceReferences);
  assert.equal(validateDemoLotContext(context,isolated,'diet',{diet:'pasture'},{diet:'balanced'}),true);
  context.model.evidenceReferences=[];
  assert.throws(()=>validateDemoLotContext(context,isolated,'diet',{diet:'pasture'},{diet:'balanced'}),/incompatível/);
  const invalidAnimalId=resolveDemoLot(snapshot,1);invalidAnimalId.animalIds[0]=0;
  assert.throws(()=>createDemoLotContext(invalidAnimalId,'diet',{diet:'pasture'},{diet:'balanced'}),/Intervenção do lote demonstrativo inválida/);
});
