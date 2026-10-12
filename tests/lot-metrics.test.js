import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateLotMetrics} from '../lot-metrics.js';

const field=(value,unit,status='observed')=>({value,unit,status});

test('lot density and space convert hectares and square metres with explicit units',()=>{
  const result=calculateLotMetrics({animalCount:20,area:field(4,'ha')});
  assert.equal(result.animalsPerHectare.value,5);
  assert.equal(result.areaPerAnimalHa.value,.2);
  assert.equal(result.areaPerAnimalM2.value,2000);
  assert.equal(result.animalsPerHectare.unit,'animais/ha');
  const m2=calculateLotMetrics({animalCount:10,area:field(2500,'m²')});
  assert.equal(m2.animalsPerHectare.value,40);
  assert.equal(m2.areaPerAnimalM2.value,250);
});

test('lot metrics reject missing, zero, invalid counts and unknown units without inventing values',()=>{
  for(const result of [
    calculateLotMetrics({animalCount:0,area:field(4,'ha')}),
    calculateLotMetrics({animalCount:true,area:field(4,'ha')}),
    calculateLotMetrics({animalCount:10,area:field(0,'ha')}),
    calculateLotMetrics({animalCount:10,area:field(5,'acres?')}),
    calculateLotMetrics({animalCount:10,area:field(null,'ha','missing')})
  ]) assert.equal(result.animalsPerHectare.available,false);
});

test('trough space converts real reported length to metres and centimetres per animal',()=>{
  const result=calculateLotMetrics({animalCount:25,troughLength:field(1200,'cm')});
  assert.equal(result.troughMetersPerAnimal.value,.48);
  assert.equal(result.troughCentimetersPerAnimal.value,48);
  assert.equal(calculateLotMetrics({animalCount:0,troughLength:field(12,'m')}).troughMetersPerAnimal.available,false);
  assert.equal(calculateLotMetrics({animalCount:12,troughLength:field(12,'yards')}).troughMetersPerAnimal.available,false);
});
