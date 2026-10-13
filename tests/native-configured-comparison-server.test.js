import assert from 'node:assert/strict';
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createServer} from '../src/server/server.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/configured-comparison-v2-parity.json',import.meta.url),'utf8'));

test('local native route exposes the Rust executor only when explicitly enabled and validates v2 requests',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'riose-native-compare-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const vector=fixture.cases[0];
  const record={type:'riose-native-result',version:1,requestVersion:2,scenario:'configured-comparison',seed:fixture.snapshot.initialSeed,
    status:'success',runId:'test-native-run',inputSha256:'a'.repeat(64),nativeResult:{version:1,
      engine:{engineVersion:'0.1.0',buildId:'test-build',modelStatus:'demonstrative_unvalidated',provenance:'native-rust-core',validated:false},
      result:{type:'configured-comparison',comparison:vector.expected}}};
  const executable=join(directory,'runner.mjs');
  const source=`#!/usr/bin/env node\nprocess.stdin.resume();let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{JSON.parse(input);process.stdout.write(${JSON.stringify(JSON.stringify(record))}+'\\n')});\n`;
  await writeFile(executable,source,{mode:0o755});
  await chmod(executable,0o755);
  const server=createServer({env:{RIOSE_NATIVE_COMPARISON:'true',RIOSE_RUNNER_PATH:executable}});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const capability=await fetch(`${root}/api/native/configured-comparison`);
  assert.deepEqual(await capability.json(),{available:true,backend:'local-rust'});
  const request={type:'configured-comparison',version:2,snapshot:fixture.snapshot,days:vector.days,
    referenceConfig:vector.referenceConfig,scenarioConfig:vector.scenarioConfig};
  const response=await fetch(`${root}/api/native/configured-comparison`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(payload.comparison,vector.expected);
  assert.equal(payload.engine.buildId,'test-build');
  assert.equal(payload.inputSha256,'a'.repeat(64));
  const invalid=await fetch(`${root}/api/native/configured-comparison`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...request,version:1})});
  assert.equal(invalid.status,400);
});

test('native configured comparison capability is disabled by default',async t=>{
  const server=createServer({env:{}});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/native/configured-comparison`);
  assert.deepEqual(await response.json(),{available:false,backend:'local-js'});
});
