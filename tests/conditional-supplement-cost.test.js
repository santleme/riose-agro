import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateConditionalSupplementCosts} from '../src/client/conditional-supplement-cost.js';

const scenarios = [
  {id: 'base', label: 'Baseline', supplementKgDMPerAnimalPerDay: 0.5},
  {id: 'intervention', label: 'Intervention', supplementKgDMPerAnimalPerDay: 1.5},
];

test('calculates supplied dry matter and conditional expense from explicit herd, horizon, price and currency', () => {
  const result = calculateConditionalSupplementCosts({animalCount: 200, days: 30, scenarios, pricePerKgDM: 2.4, currency: 'BRL', scope: 'experiment'});
  assert.equal(result.type, 'riose-conditional-supplement-cost');
  assert.equal(result.version, 1);
  assert.equal(result.provenance.calculation, 'daily supplied supplement × represented animals × applicable days × user price per kg DM');
  assert.deepEqual(result.scenarios.map(row => [row.suppliedSupplementKgDM, row.expense]), [[3000, 7200], [9000, 21600]]);
  assert.equal(result.scenarios[1].differenceFromBaseline, 14400);
  assert.equal(result.units.expense, 'BRL');
  assert.equal(result.basis.price, 'BRL/kg DM');
});

test('supports a branch remaining horizon and rejects missing price, invalid units or overflow', () => {
  const branch = calculateConditionalSupplementCosts({animalCount: 24, days: 15, scenarios, pricePerKgDM: 3, currency: 'USD', scope: 'branch', checkpointDay: 15});
  assert.equal(branch.basis.days, 15);
  assert.equal(branch.basis.scope, 'branch');
  assert.equal(branch.basis.checkpointDay, 15);
  assert.throws(() => calculateConditionalSupplementCosts({animalCount: 2, days: 1, scenarios, pricePerKgDM: null, currency: null, scope: 'experiment'}), /price/i);
  assert.throws(() => calculateConditionalSupplementCosts({animalCount: 2, days: 1, scenarios, pricePerKgDM: 1, currency: 'dollars', scope: 'experiment'}), /currency/i);
  assert.throws(() => calculateConditionalSupplementCosts({animalCount: 2, days: 1, scenarios: [{...scenarios[0], supplementKgDMPerAnimalPerDay: -0.1}], pricePerKgDM: 1, currency: 'BRL', scope: 'experiment'}), /supplement/i);
  assert.throws(() => calculateConditionalSupplementCosts({animalCount: 10000, days: 365, scenarios, pricePerKgDM: Number.MAX_VALUE, currency: 'BRL', scope: 'experiment'}), /price/i);
});
