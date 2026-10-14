import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createViewLayout,
  decodeWorkerCommand,
  normalizeWorkerResponse,
  WORKER_PROTOCOL_VERSION,
  WorkerProtocolError
} from '../src/client/worker-protocol.js';

const protocolError = (run, code) => assert.throws(run, error => error instanceof WorkerProtocolError && error.code === code);
const intakeKeys = ['pastureKgDM', 'barnBaseKgDM', 'supplementKgDM', 'dietExtraKgDM'];
function protocolSnapshot(intake = {pastureKgDM: 10, barnBaseKgDM: 0, supplementKgDM: 2, dietExtraKgDM: 1}) {
  return {hour: 6, animals: [{id: 1, name: 'Aurora', action: 'grazing', patch: 0, x: 10, y: 20, weight: 330,
    initialWeight: 330, energy: 75, thirst: 20}], pastures: [1, 2, 3, 4], config: {
    diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0
  }, cost: 0, events: [], ...(intake === undefined ? {} : {intake})};
}

test('Worker command decoder accepts v1 and only adapts known unversioned commands', () => {
  assert.deepEqual(decodeWorkerCommand({protocolVersion: 1, type: 'tick', hours: 24}), {
    command: {protocolVersion: 1, type: 'tick', hours: 24}, legacy: false
  });
  assert.deepEqual(decodeWorkerCommand({type: 'snapshot'}), {
    command: {protocolVersion: 1, type: 'snapshot'}, legacy: true
  });
  assert.deepEqual(decodeWorkerCommand({type: 'snapshot', ignored: true}).command, {
    protocolVersion: 1, type: 'snapshot'
  });
});

test('Worker command decoder rejects malformed versions, commands and payloads deterministically', () => {
  protocolError(() => decodeWorkerCommand(null), 'INVALID_COMMAND');
  protocolError(() => decodeWorkerCommand({type: 'snapshot', protocolVersion: null}), 'INVALID_PROTOCOL_VERSION');
  protocolError(() => decodeWorkerCommand({type: 'snapshot', protocolVersion: '1'}), 'INVALID_PROTOCOL_VERSION');
  protocolError(() => decodeWorkerCommand({type: 'snapshot', protocolVersion: 2}), 'UNSUPPORTED_PROTOCOL_VERSION');
  protocolError(() => decodeWorkerCommand({type: 'future'}), 'UNKNOWN_COMMAND');
  protocolError(() => decodeWorkerCommand({type: 'tick', hours: 1.5}), 'INVALID_COMMAND_PAYLOAD');
  protocolError(() => decodeWorkerCommand({protocolVersion: 1, type: 'tick', hours: Infinity}), 'INVALID_COMMAND_PAYLOAD');
  protocolError(() => decodeWorkerCommand({type: 'load'}), 'INVALID_COMMAND_PAYLOAD');
  protocolError(() => decodeWorkerCommand({type: 'load', snapshot: {}}), 'INVALID_COMMAND_PAYLOAD');
  protocolError(() => decodeWorkerCommand({type: 'select'}), 'INVALID_COMMAND_PAYLOAD');
});

test('lot simulation and replay commands accept only manifest envelopes',()=>{
  for(const type of ['compareLotConfigured','replayLotConfigured']){
    assert.deepEqual(decodeWorkerCommand({protocolVersion:1,type,manifest:{type:'riose-configured-comparison',targetScope:{kind:'lot'}}}).command,{protocolVersion:1,type,manifest:{type:'riose-configured-comparison',targetScope:{kind:'lot'}}});
    protocolError(()=>decodeWorkerCommand({protocolVersion:1,type}), 'INVALID_COMMAND_PAYLOAD');
  }
});

test('load accepts legacy snapshots without intake and complete finite intake ledgers', () => {
  const legacySnapshot = protocolSnapshot();
  delete legacySnapshot.intake;
  assert.equal(decodeWorkerCommand({type: 'load', snapshot: legacySnapshot}).command.type, 'load');
  assert.equal(decodeWorkerCommand({type: 'load', snapshot: protocolSnapshot()}).command.type, 'load');
});

test('load rejects intake ledgers missing any required component', () => {
  for (const key of intakeKeys) {
    const snapshot = protocolSnapshot();
    delete snapshot.intake[key];
    protocolError(() => decodeWorkerCommand({type: 'load', snapshot}), 'INVALID_COMMAND_PAYLOAD');
  }
});

test('load rejects nonnumeric, null, undefined and nonfinite intake values', () => {
  for (const key of intakeKeys) {
    for (const value of [undefined, null, '10', NaN, Infinity, -Infinity]) {
      const snapshot = protocolSnapshot();
      snapshot.intake[key] = value;
      protocolError(() => decodeWorkerCommand({type: 'load', snapshot}), 'INVALID_COMMAND_PAYLOAD');
    }
  }
});

test('Worker response decoder adapts a well-formed legacy view to the declared current layout', () => {
  const legacy = normalizeWorkerResponse({
    type: 'view', hour: 6, pastures: [1, 2, 3, 4], cost: 0, intake: {},
    config: {diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, events: [],
    animalIds: new Uint32Array([1]), animalValues: new Float64Array([10, 20, 300, 300]),
    animalActions: new Uint8Array([0]), selectedAnimalId: 1, selectedHistory: [], engineImplementation: 'javascript-fallback'
  });
  assert.equal(legacy.protocolVersion, WORKER_PROTOCOL_VERSION);
  assert.deepEqual(legacy.viewLayout, createViewLayout(1));
  const reorderedMetadata = normalizeWorkerResponse({...legacy, protocolVersion: 1, viewLayout: {
    ...legacy.viewLayout,
    animalIds: {byteLength: 4, stride: 1, count: 1, elementType: 'Uint32Array'}
  }});
  assert.equal(reorderedMetadata.type, 'view', 'metadata object property order has no protocol meaning');
  protocolError(() => normalizeWorkerResponse({...legacy, protocolVersion: 1, viewLayout: {
    ...legacy.viewLayout,
    animalValues: {...legacy.viewLayout.animalValues, byteLength: legacy.viewLayout.animalValues.byteLength + 8}
  }}), 'INVALID_RESPONSE');
  protocolError(() => normalizeWorkerResponse({...legacy, protocolVersion: 1, animalIds: new Uint32Array(new ArrayBuffer(8), 4, 1)}), 'INVALID_RESPONSE');
});

test('Worker response decoder rejects unsupported versions and inconsistent view buffers', () => {
  protocolError(() => normalizeWorkerResponse({type: 'state', protocolVersion: 7, state: {}, engineImplementation: 'js'}), 'UNSUPPORTED_PROTOCOL_VERSION');
  protocolError(() => normalizeWorkerResponse({type: 'state', protocolVersion: undefined, state: {}, engineImplementation: 'js'}), 'INVALID_PROTOCOL_VERSION');
  protocolError(() => normalizeWorkerResponse({type: 'state', protocolVersion: 1, state: {}, engineImplementation: 'js'}), 'INVALID_RESPONSE');
  protocolError(() => normalizeWorkerResponse({type: 'view', hour: 6, pastures: [1, 2, 3, 4], cost: 0, config: {}, events: [],
    animalIds: new Uint32Array([1]), animalValues: new Float64Array(3), animalActions: new Uint8Array([0]),
    selectedAnimalId: 1, selectedHistory: [], engineImplementation: 'js'}), 'INVALID_RESPONSE');
  protocolError(() => normalizeWorkerResponse({type: 'comparison', protocolVersion: 1, data: {}, engineImplementation: 'js'}), 'INVALID_RESPONSE');
});

test('Worker response decoder rejects malformed configuration and nested view records before UI mutation', () => {
  const base = {type: 'view', hour: 6, pastures: [1, 2, 3, 4], cost: 0,
    config: {diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, events: [],
    animalIds: new Uint32Array([1]), animalValues: new Float64Array([10, 20, 300, 300]),
    animalActions: new Uint8Array([0]), selectedAnimalId: 1, selectedHistory: [], engineImplementation: 'js'};
  protocolError(() => normalizeWorkerResponse({...base, config: {}}), 'INVALID_RESPONSE');
  protocolError(() => normalizeWorkerResponse({...base, events: [null]}), 'INVALID_RESPONSE');
  protocolError(() => normalizeWorkerResponse({...base, selectedHistory: [null]}), 'INVALID_RESPONSE');
});

test('Worker error responses require a structured code and readable message', () => {
  const legacy = normalizeWorkerResponse({type: 'error', message: 'engine failed'});
  assert.deepEqual(legacy.error, {code: 'LEGACY_WORKER_ERROR', message: 'engine failed'});
  protocolError(() => normalizeWorkerResponse({protocolVersion: 1, type: 'error', message: 'missing structure'}), 'INVALID_RESPONSE');
});

test('module Worker emits versioned responses and deterministic errors while retaining legacy commands', async t => {
  const originalSelf = globalThis.self;
  t.after(() => {globalThis.self = originalSelf;});
  const worker = {messages: [], transfers: [], postMessage(message, transfers = []) {this.messages.push(message);this.transfers.push(transfers);}};
  globalThis.self = worker;
  await import(`../src/client/worker.js?protocol-test=${Math.random()}`);

  await worker.onmessage({data: {protocolVersion: 1, type: 'reset', seed: 917, count: 3}});
  const reset = worker.messages.at(-1);
  assert.equal(reset.protocolVersion, WORKER_PROTOCOL_VERSION);
  assert.equal(reset.type, 'state', JSON.stringify(reset));
  assert.equal(reset.state.animals.length, 3);

  await worker.onmessage({data: {protocolVersion: 1, type: 'load', snapshot: reset.state, selectedAnimalId: 2}});
  const loaded = worker.messages.at(-1);
  assert.equal(loaded.protocolVersion, WORKER_PROTOCOL_VERSION);
  assert.equal(loaded.type, 'state', 'load retains its full snapshot response');
  assert.deepEqual(loaded.state, reset.state);

  const legacySnapshot = structuredClone(reset.state);
  delete legacySnapshot.intake;
  await worker.onmessage({data: {type: 'load', snapshot: legacySnapshot}});
  assert.equal(worker.messages.at(-1).type, 'state', 'legacy snapshots without intake remain loadable');
  await worker.onmessage({data: {type: 'tick', hours: 1}});
  assert.ok(Object.values(worker.messages.at(-1).intake).every(Number.isFinite), 'the engine initializes the absent legacy ledger on tick');
  await worker.onmessage({data: {protocolVersion: 1, type: 'load', snapshot: reset.state, selectedAnimalId: 2}});

  await worker.onmessage({data: {protocolVersion: 1, type: 'configure', patch: {housing: 'barn'}}});
  const view = normalizeWorkerResponse(worker.messages.at(-1));
  assert.equal(view.type, 'view');
  assert.deepEqual(view.viewLayout, createViewLayout(3));
  assert.ok(view.animalIds instanceof Uint32Array);
  assert.ok(view.animalValues instanceof Float64Array);
  assert.ok(view.animalActions instanceof Uint8Array);
  assert.equal(worker.transfers.at(-1).length, 3);

  await worker.onmessage({data: {protocolVersion: 1, type: 'tick', hours: 1}});
  const tickView = normalizeWorkerResponse(worker.messages.at(-1));
  assert.equal(tickView.type, 'view', 'routine ticks retain the compact view response');
  assert.equal(tickView.hour, view.hour + 1);

  await worker.onmessage({data: {type: 'snapshot'}});
  assert.equal(worker.messages.at(-1).protocolVersion, WORKER_PROTOCOL_VERSION);
  assert.equal(worker.messages.at(-1).type, 'state', JSON.stringify(worker.messages.at(-1)));

  await worker.onmessage({data: {protocolVersion: 8, type: 'tick', hours: 1}});
  assert.deepEqual(worker.messages.at(-1).error.code, 'UNSUPPORTED_PROTOCOL_VERSION');
  assert.match(worker.messages.at(-1).error.message, /Supported version: 1/);

  await worker.onmessage({data: {protocolVersion: 1, type: 'futureCommand'}});
  assert.equal(worker.messages.at(-1).error.code, 'UNKNOWN_COMMAND');

  const stateBeforeInvalidLoad = worker.messages.findLast(message => message.type === 'state').state;
  const partialIntakeSnapshot = structuredClone(stateBeforeInvalidLoad);
  delete partialIntakeSnapshot.intake.supplementKgDM;
  await worker.onmessage({data: {protocolVersion: 1, type: 'load', snapshot: partialIntakeSnapshot}});
  assert.equal(worker.messages.at(-1).error.code, 'INVALID_COMMAND_PAYLOAD');
  await worker.onmessage({data: {protocolVersion: 1, type: 'snapshot'}});
  assert.deepEqual(worker.messages.at(-1).state, stateBeforeInvalidLoad, 'invalid intake ledgers are rejected before replacing engine state');
  await worker.onmessage({data: {protocolVersion: 1, type: 'tick', hours: 1}});
  const afterRejectedLoadTick = normalizeWorkerResponse(worker.messages.at(-1));
  assert.ok(Object.values(afterRejectedLoadTick.intake).every(Number.isFinite), 'the rejected partial ledger never reaches the engine tick');

  const hourBeforeInvalidTick = afterRejectedLoadTick.hour;
  await worker.onmessage({data: {protocolVersion: 1, type: 'tick', hours: 1.5}});
  assert.equal(worker.messages.at(-1).error.code, 'INVALID_COMMAND_PAYLOAD');
  await worker.onmessage({data: {protocolVersion: 1, type: 'snapshot'}});
  assert.equal(worker.messages.at(-1).state.hour, hourBeforeInvalidTick, 'invalid commands are rejected before mutating engine state');
});
