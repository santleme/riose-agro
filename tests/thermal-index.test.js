import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';

test('Mader feedlot THI reproduces the published bovine example to reported precision',()=>{
  const result=calculateThi(26.8,57.5);
  assert.equal(result.value,74.97);
  assert.equal(result.unit,'THI');
  assert.match(THI_SOURCE.doi,/10\.2527\/2006\.843712x/);
  assert.equal(Number(result.value.toFixed(1)),75.0);
});

test('THI requires both finite inputs and validates the documented input ranges',()=>{
  assert.equal(calculateThi(null,60).available,false);
  assert.equal(calculateThi(25,null).available,false);
  assert.equal(calculateThi(25,101).available,false);
  assert.equal(calculateThi(true,50).available,false);
  assert.equal(calculateThi(25,false).available,false);
  assert.equal(calculateThi(-41,50).available,false);
  assert.equal(calculateThi(60,100).available,true);
});
