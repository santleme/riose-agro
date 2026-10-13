import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/benchmark-scenario-scheduler.mjs',import.meta.url));

test('scenario scheduler benchmark honors scale, warmups, bounded concurrency and reports p95 with raw samples',()=>{
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,
    RIOSE_SCHEDULER_SCENARIO_COUNT:'4',RIOSE_SCHEDULER_REPETITIONS:'3',RIOSE_SCHEDULER_WARMUPS:'0'}});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.results.workload.scenarios,4);
  assert.equal(report.configuration.warmupRuns,0);
  assert.equal(report.configuration.repetitions,3);
  assert.equal(report.configuration.maxWorkerConcurrency,4);
  assert.deepEqual(report.configuration.concurrencyCases,[1,2,4]);
  for(const row of report.rows){
    assert.equal(row.scenarioCount,4);
    assert.equal(row.sampleCount,3);
    assert.equal(row.allPassed,true);
    assert.equal(row.p95WallMs,Math.max(...row.samples.map(sample=>sample.wallMs)));
    assert.equal(row.p95EndToEndMs,Math.max(...row.samples.map(sample=>sample.endToEndMs)));
  }
});

test('scenario scheduler can select sequential and parallel comparison cases',()=>{
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,
    RIOSE_SCHEDULER_SCENARIO_COUNT:'4',RIOSE_SCHEDULER_REPETITIONS:'3',RIOSE_SCHEDULER_WARMUPS:'0',
    RIOSE_SCHEDULER_CONCURRENCIES:'1,4'}});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.deepEqual(report.configuration.concurrencyCases,[1,4]);
  assert.deepEqual(report.rows.map(row=>row.concurrency),[1,4]);
});
