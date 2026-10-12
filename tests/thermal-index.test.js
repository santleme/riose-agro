import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';

const numericReferences = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8'));
const maderExample = numericReferences.fixtures.mader2006ThiPublishedExample;

test('Mader formula matches a published crossbred-calf THI example to reported precision',()=>{
  const result=calculateThi(maderExample.inputs.temperatureC.value,maderExample.inputs.relativeHumidityPct.value);
  const intermediates=maderExample.intermediates;
  assert.equal(0.8*maderExample.inputs.temperatureC.value,intermediates.temperatureTerm.value);
  assert.equal(maderExample.inputs.relativeHumidityPct.value/100,intermediates.humidityFraction.value);
  assert.equal(maderExample.inputs.temperatureC.value-14.4,intermediates.temperatureOffsetC.value);
  assert.equal(intermediates.humidityFraction.value*intermediates.temperatureOffsetC.value,intermediates.humidityTerm.value);
  assert.equal(intermediates.constantTerm.value,46.4);
  assert.equal(intermediates.temperatureTerm.value+intermediates.humidityTerm.value+intermediates.constantTerm.value,maderExample.expected.calculatedThi);
  assert.equal(result.value,maderExample.expected.calculatedThi);
  assert.ok(Math.abs(result.value-maderExample.expected.publishedRoundedThi)<maderExample.expected.publishedPrecisionTolerance);
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
