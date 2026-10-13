import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateAnimalLayoutDecision} from '../scripts/animal-layout-decision.mjs';

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
