import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {evaluateAnimalLayoutDecision} from '../scripts/benchmarks/animal-layout-decision.mjs';

const evidencePath=new URL('../docs/evidence/animal-layout-study-2026-10-13.json',import.meta.url);

const row=(animals,hour,aos,soa)=>({animals,hour,measurements:{
  aosEndToEnd:{observations:aos},
  typedColumnsEndToEnd:{observations:soa},
},pairedComparison:{paired:true,orderBySample:aos.map((_,index)=>index%2===0?'AoS-then-SoA':'SoA-then-AoS')}});

test('animal layout decision requires consistent median and sample wins across all workloads',()=>{
  const result=evaluateAnimalLayoutDecision([
    row(100,7,[10,10,10,10,10],[8,8,8,8,8]),
    row(100,22,[10,10,10,10,10],[8,8,8,8,8]),
  ]);
  assert.equal(result.repeatableAcrossWorkloads,true);
  assert.equal(result.comparisons.every(value=>value.repeatableNetWin),true);
  assert.match(result.recommendation,/review the prototype/);
});

test('animal layout decision keeps AoS when even one workload loses end to end',()=>{
  const result=evaluateAnimalLayoutDecision([
    row(100,7,[10,10,10,10,10],[8,8,8,8,8]),
    row(100,22,[10,10,10,10,10],[11,11,11,11,11]),
  ]);
  assert.equal(result.repeatableAcrossWorkloads,false);
  assert.equal(result.comparisons[0].repeatableNetWin,true);
  assert.equal(result.comparisons[1].repeatableNetWin,false);
  assert.match(result.recommendation,/Keep object-per-animal/);
});

test('animal layout decision rejects mismatched or too-short observations',()=>{
  assert.throws(()=>evaluateAnimalLayoutDecision([row(100,7,[1,2],[0])]),/equally sized finite/);
  assert.throws(()=>evaluateAnimalLayoutDecision([row(100,7,[1,2],[0,0])]),/at least 3/);
});

test('animal layout decision rejects unpaired or non-counterbalanced sample vectors',()=>{
  const unpaired=row(100,7,[10,10,10],[8,8,8]);
  unpaired.pairedComparison={paired:false,orderBySample:['AoS-then-SoA','SoA-then-AoS','AoS-then-SoA']};
  assert.throws(()=>evaluateAnimalLayoutDecision([unpaired]),/counterbalanced paired sample order/);

  const sameOrder=row(100,7,[10,10,10],[8,8,8]);
  sameOrder.pairedComparison.orderBySample=['AoS-then-SoA','AoS-then-SoA','AoS-then-SoA'];
  assert.throws(()=>evaluateAnimalLayoutDecision([sameOrder]),/counterbalanced paired sample order/);
});

test('checked-in animal layout evidence contains separate statistical allocation profiles',()=>{
  const report=JSON.parse(readFileSync(fileURLToPath(evidencePath),'utf8'));
  const profileNames=[
    'aosTransition',
    'typedColumnsKernel',
    'typedColumnsGather',
    'typedColumnsScatter',
    'typedColumnsEndToEnd',
    'snapshotMaterializationAos',
    'snapshotMaterializationColumns',
  ];

  assert.equal(report.benchmark.source.dirty,false);
  assert.equal(report.results.allocationProfiling.method,'V8 HeapProfiler.startSampling/stopSampling');
  assert.equal(report.results.allocationProfiling.samplingIntervalBytes,4096);
  assert.equal(report.results.allocationProfiling.profileTimingIncludedInBenchmarkMeasurements,false);
  assert.equal(report.results.allocationProfiling.estimatedAllocatedBytesAreStatistical,true);
  const attributionUrls=[report.results.allocationProfiling.attributedUrl,...report.results.rows.flatMap(row=>
    Object.values(row.allocationNotes.profiles).flatMap(profile=>profile.topSites.map(site=>site.url)))];
  assert.ok(attributionUrls.length>0);
  assert.ok(attributionUrls.every(url=>url==='scripts/benchmark-animal-layout.mjs'));
  assert.ok(attributionUrls.every(url=>!url.includes('file://')&&!url.includes('/home/')&&!/^[A-Za-z]:[\\/]/.test(url)));
  assert.equal(report.results.rows.length,6);

  for(const row of report.results.rows){
    assert.deepEqual(Object.keys(row.allocationNotes.profiles).sort(),[...profileNames].sort());
    for(const profile of Object.values(row.allocationNotes.profiles)){
      assert.equal(profile.method,'v8-heap-profiler-sampling');
      assert.equal(profile.samplingIntervalBytes,4096);
      assert.equal(profile.warmupIterations,1000);
      assert.equal(profile.majorGarbageCollectionForced,true);
      assert.ok(Number.isInteger(profile.allocationSampleCount));
      assert.ok(profile.allocationSampleCount>=0);
      assert.ok(Number.isFinite(profile.estimatedAllocatedBytes));
      assert.ok(profile.estimatedAllocatedBytes>=0);
    }
  }
});
