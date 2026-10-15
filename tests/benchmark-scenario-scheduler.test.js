import assert from 'node:assert/strict';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/benchmarks/benchmark-scenario-scheduler.mjs',import.meta.url));
const availableWorkers=Math.min(os.availableParallelism(),4);
const defaultConcurrencyCases=[...new Set([1,Math.min(2,availableWorkers),availableWorkers])];

test('scenario scheduler benchmark honors scale, warmups, bounded concurrency and reports p95 with raw samples',()=>{
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,
    RIOSE_SCHEDULER_SCENARIO_COUNT:'4',RIOSE_SCHEDULER_REPETITIONS:'3',RIOSE_SCHEDULER_WARMUPS:'0'}});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.results.workload.scenarios,4);
  assert.equal(report.configuration.warmupRuns,0);
  assert.equal(report.configuration.repetitions,3);
  assert.equal(report.configuration.maxWorkerConcurrency,4);
  assert.deepEqual(report.configuration.concurrencyCases,defaultConcurrencyCases);
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
    RIOSE_SCHEDULER_CONCURRENCIES:[...new Set([1,Math.min(4,availableWorkers)])].join(',')}});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  const expected=[...new Set([1,Math.min(4,availableWorkers)])];
  assert.deepEqual(report.configuration.concurrencyCases,expected);
  assert.deepEqual(report.rows.map(row=>row.concurrency),expected);
});

test('scenario scheduler deduplicates default concurrency cases for a one-scenario workload',()=>{
  const env={...process.env,RIOSE_SCHEDULER_SCENARIO_COUNT:'1',RIOSE_SCHEDULER_REPETITIONS:'1',RIOSE_SCHEDULER_WARMUPS:'0'};
  delete env.RIOSE_SCHEDULER_CONCURRENCIES;
  const result=spawnSync(process.execPath,[script],{encoding:'utf8',maxBuffer:4*1024*1024,env});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.deepEqual(report.configuration.concurrencyCases,[1]);
  assert.deepEqual(report.rows.map(row=>row.concurrency),[1]);
  assert.equal(report.rows[0].scenarioCount,1);
  assert.equal(report.rows[0].allPassed,true);
});
