import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_FACTOR_CATEGORIES,
  FACTOR_CATEGORIES,
  VALID_FACTOR_CATEGORIES,
  classifyConfiguration,
  classifyFactor,
  isFactorCategory,
} from '../src/client/factor-classification.js';

test('classifies external environmental factors and management factors', () => {
  for (const factor of ['temperature', 'humidity', 'rain', 'wind', 'environment', 'weather', 'chuva', 'umidade']) {
    assert.equal(classifyFactor(factor), FACTOR_CATEGORIES.EXTERNAL, factor);
  }
  for (const factor of ['diet', 'feed', 'feedingFrequency', 'feedingSchedule', 'trough', 'water', 'shade', 'ventilation', 'cleaning', 'cocho']) {
    assert.equal(classifyFactor(factor), FACTOR_CATEGORIES.MANAGEMENT, factor);
  }
});

test('legacy configuration fields receive compatible classifications without changing their values', () => {
  const legacyConfig = {diet: 'balanced', housing: 'pasture', weather: 'rain', supplement: 1.5};
  assert.deepEqual(classifyConfiguration(legacyConfig), [
    {key: 'diet', value: 'balanced', category: 'management'},
    {key: 'housing', value: 'pasture', category: 'management'},
    {key: 'weather', value: 'rain', category: 'external'},
    {key: 'supplement', value: 1.5, category: 'management'},
  ]);
  assert.deepEqual(legacyConfig, {diet: 'balanced', housing: 'pasture', weather: 'rain', supplement: 1.5});
});

test('missing categories use the field-name fallback and unknown legacy fields remain unclassified', () => {
  assert.equal(classifyFactor({path: 'climate.temperature'}), 'external');
  assert.equal(classifyFactor({key: 'diet'}), 'management');
  assert.equal(classifyFactor({key: 'diet', category: null}), 'management');
  assert.equal(classifyFactor('siteIdentifier'), null);
  assert.deepEqual(classifyConfiguration({temperature: 29, siteIdentifier: 'farm-1'}), [
    {key: 'temperature', value: 29, category: 'external'},
    {key: 'siteIdentifier', value: 'farm-1', category: null},
  ]);
});

test('validates the future category structurally without assigning it to active factors', () => {
  assert.deepEqual(ACTIVE_FACTOR_CATEGORIES, ['external', 'management']);
  assert.deepEqual(VALID_FACTOR_CATEGORIES, ['external', 'management', 'partially_controllable']);
  assert.equal(ACTIVE_FACTOR_CATEGORIES.includes('partially_controllable'), false);
  assert.equal(isFactorCategory('partially_controllable'), true);
  assert.equal(classifyFactor({key: 'water', category: 'partially_controllable'}), 'partially_controllable');
  assert.equal(classifyFactor('water'), 'management');
  assert.equal(isFactorCategory('uncontrolled'), false);
  assert.throws(() => classifyFactor({key: 'water', category: 'uncontrolled'}), /Categoria de fator inválida/);
});

test('rejects malformed factor and configuration inputs', () => {
  assert.throws(() => classifyFactor({}), /chave não vazia/);
  assert.throws(() => classifyConfiguration(null), /Configuração precisa ser um objeto/);
});
