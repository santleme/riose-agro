import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  FarmEngine,compareConfiguredScenarios,createConfiguredComparisonManifest,
  replayConfiguredComparisonManifest,validateConfiguredComparisonManifest
} from '../src/client/engine.js';
import {createComparisonArchive} from '../src/client/comparison-archive.js';
import {readEngineSourceBundle} from '../scripts/engine-source-hash.js';
import {createRunRecord,runCompatibility} from '../src/client/run-history.js';
import {validateReproducibilityManifest,replayScenarioContract} from '../src/client/scenario-contract.js';
import {decodeWorkerCommand,normalizeWorkerResponse} from '../src/client/worker-protocol.js';

const schema=JSON.parse(readFileSync(new URL('../schemas/configured-comparison-manifest-v1.schema.json',import.meta.url),'utf8'));
const validateSchema=new Ajv2020({allErrors:true,strict:false}).compile(schema);
const snapshot=new FarmEngine(981,4).snapshot();
const referenceConfig={...snapshot.config,diet:'pasture'};
const scenarioConfig={...snapshot.config,diet:'concentrate'};

test('configured manifest is versioned, schema-valid, and replayable through the archive contract',()=>{
  const manifest=createConfiguredComparisonManifest(snapshot,{referenceConfig,scenarioConfig,days:4});
  assert.equal(validateSchema(manifest),true,JSON.stringify(validateSchema.errors));
  assert.equal(validateConfiguredComparisonManifest(manifest),true);
  assert.equal(validateReproducibilityManifest(manifest),true);
  assert.deepEqual(replayScenarioContract(manifest),replayConfiguredComparisonManifest(manifest));
  const archive=createComparisonArchive(Buffer.from(JSON.stringify(manifest)),readEngineSourceBundle(),'2026-10-13T12:00:00.000Z');
  assert.equal(archive.manifestReference.type,'riose-configured-comparison');
  assert.equal(archive.comparison.comparisonFactor,'diet');
  assert.equal(archive.comparison.validated,false);
});

test('run history preserves and validates the configured intervention for future replay',()=>{
  const manifest=createConfiguredComparisonManifest(snapshot,{referenceConfig,scenarioConfig,days:3});
  const result=compareConfiguredScenarios(snapshot,{referenceConfig,scenarioConfig,days:3});
  const run=createRunRecord({manifest,result,id:'configured-comparison-run'});
  assert.equal(run.scenario.factor,'diet');
  assert.equal(run.manifest.type,'riose-configured-comparison');
  assert.equal(runCompatibility(run).supported,true);
  assert.deepEqual(replayConfiguredComparisonManifest(run.manifest),result);
});

test('Worker protocol accepts only complete configured comparison inputs and validates its result shape',()=>{
  const command={protocolVersion:1,type:'compareConfigured',snapshot,days:2,referenceConfig,scenarioConfig};
  assert.equal(decodeWorkerCommand(command).command.type,'compareConfigured');
  assert.throws(()=>decodeWorkerCommand({...command,scenarioConfig:{diet:'future'}}),/complete valid configurations/);
  const data=compareConfiguredScenarios(snapshot,{referenceConfig,scenarioConfig,days:2});
  assert.equal(normalizeWorkerResponse({protocolVersion:1,type:'comparison',data,engineImplementation:'javascript-fallback'}).type,'comparison');
  assert.throws(()=>normalizeWorkerResponse({protocolVersion:1,type:'comparison',data:{...data,validated:true},engineImplementation:'javascript-fallback'}),/comparison.data/);
});
