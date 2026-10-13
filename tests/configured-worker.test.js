import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguredComparisonManifest} from '../src/client/engine.js';
import {normalizeWorkerResponse} from '../src/client/worker-protocol.js';

test('module Worker executes and replays configured scenario comparisons',async t=>{
  const previousSelf=globalThis.self;
  t.after(()=>{globalThis.self=previousSelf;});
  const worker={messages:[],postMessage(message){this.messages.push(message);}};
  globalThis.self=worker;
  await import(`../src/client/worker.js?configured-comparison-test=${Math.random()}`);
  await worker.onmessage({data:{protocolVersion:1,type:'reset',seed:719,count:4}});
  const snapshot=worker.messages.at(-1).state;
  const referenceConfig={...snapshot.config,diet:'pasture'};
  const scenarioConfig={...snapshot.config,diet:'balanced'};
  await worker.onmessage({data:{protocolVersion:1,type:'compareConfigured',snapshot,days:2,referenceConfig,scenarioConfig}});
  const compared=normalizeWorkerResponse(worker.messages.at(-1));
  assert.equal(compared.type,'comparison');
  assert.equal(compared.data.comparisonFactor,'diet');
  assert.equal(compared.data.rows.length,3);

  const manifest=createConfiguredComparisonManifest(snapshot,{referenceConfig,scenarioConfig,days:2});
  await worker.onmessage({data:{protocolVersion:1,type:'replayConfigured',manifest}});
  const replayed=normalizeWorkerResponse(worker.messages.at(-1));
  assert.deepEqual(replayed.data,compared.data);
});
