import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateThi,THI_SOURCE} from '../src/client/thermal-index.js';

const numericReferences = JSON.parse(readFileSync(new URL('./fixtures/scientific-numeric-reference-v1.json', import.meta.url), 'utf8'));
const maderExample = numericReferences.fixtures.mader2006ThiPublishedExample;

test('Mader formula calculates THI from cited published temperature and humidity inputs',()=>{
  assert.equal(maderExample.locator.formulaSource,'https://doi.org/10.2527/2006.843712x');
  assert.match(maderExample.locator.formulaSourceDetails,/page 715, Table 3 footnote/);
  assert.equal(maderExample.locator.inputConditionsSource,'https://ve.scielo.org/scielo.php?pid=S0798-22592007000500007&script=sci_arttext');
  assert.equal(maderExample.locator.inputConditionsLocator,'Table I, Trial 1, December row; temperature and humidity for calves. Its reported THI uses the West (1994)/Hammond et al. (1998) expression in the table footnote, not Mader.');
  assert.deepEqual(maderExample.domainAssumptions.temperatureC,[-40,60]);
  assert.deepEqual(maderExample.domainAssumptions.relativeHumidityPct,[0,100]);
  assert.deepEqual(maderExample.inputs.temperatureC.unit,'°C');
  assert.deepEqual(maderExample.inputs.relativeHumidityPct.unit,'%');
  assert.deepEqual(maderExample.expected.unit,'THI');
  assert.deepEqual(maderExample.expected.physicalDimension,'dimensionless index');
  const result=calculateThi(maderExample.inputs.temperatureC.value,maderExample.inputs.relativeHumidityPct.value);
  const intermediates=maderExample.intermediates;
  assert.equal(0.8*maderExample.inputs.temperatureC.value,intermediates.temperatureTerm.value);
  assert.equal(maderExample.inputs.relativeHumidityPct.value/100,intermediates.humidityFraction.value);
  assert.equal(maderExample.inputs.temperatureC.value-14.4,intermediates.temperatureOffsetC.value);
  assert.equal(intermediates.humidityFraction.value*intermediates.temperatureOffsetC.value,intermediates.humidityTerm.value);
  assert.equal(intermediates.constantTerm.value,46.4);
  assert.equal(intermediates.temperatureTerm.value+intermediates.humidityTerm.value+intermediates.constantTerm.value,maderExample.expected.calculatedThi);
  assert.equal(result.value,maderExample.expected.calculatedThi);
  assert.ok(Math.abs(result.value-maderExample.expected.calculatedThi)<maderExample.expected.calculationTolerance);
  assert.equal(result.unit,maderExample.expected.unit);
  assert.match(THI_SOURCE.doi,/10\.2527\/2006\.843712x/);
});

test('THI requires both finite inputs and validates the documented input ranges',()=>{
  const [minimumTemperature,maximumTemperature]=maderExample.domainAssumptions.temperatureC;
  const [minimumHumidity,maximumHumidity]=maderExample.domainAssumptions.relativeHumidityPct;
  assert.equal(calculateThi(null,60).available,false);
  assert.equal(calculateThi(25,null).available,false);
  assert.equal(calculateThi(true,50).available,false);
  assert.equal(calculateThi(25,false).available,false);
  assert.equal(calculateThi(Number.NaN,50).available,false);
  assert.equal(calculateThi(25,Number.POSITIVE_INFINITY).available,false);
  for (const temperatureC of [minimumTemperature,maximumTemperature]) {
    assert.equal(calculateThi(temperatureC,50).available,true,`temperature ${temperatureC} °C is an inclusive boundary`);
  }
  for (const relativeHumidityPct of [minimumHumidity,maximumHumidity]) {
    assert.equal(calculateThi(25,relativeHumidityPct).available,true,`relative humidity ${relativeHumidityPct}% is an inclusive boundary`);
  }
  assert.equal(calculateThi(minimumTemperature-1,50).available,false);
  assert.equal(calculateThi(maximumTemperature+1,50).available,false);
  assert.equal(calculateThi(25,minimumHumidity-1).available,false);
  assert.equal(calculateThi(25,maximumHumidity+1).available,false);
});
