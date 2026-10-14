import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FarmEngine,
  compare,
  compareConfiguredScenarios,
  createComparisonManifest,
  createConfiguredComparisonManifest,
  replayComparisonManifest,
  replayConfiguredComparisonManifest,
  validateConfiguredComparisonManifest
} from '../src/client/engine.js';
import {createDemoLotContext,createDemoLotManifestEnvelope,isolateDemoLotSnapshot,resolveDemoLot,validateDemoLotManifestEnvelope} from '../src/client/lot-selection.js';

const pairs = [
  ['diet', {diet: 'pasture'}, {diet: 'balanced'}],
  ['weather', {weather: 'normal'}, {weather: 'hot'}],
  ['supplement', {supplement: 0}, {supplement: 1.5}],
  ['housing', {housing: 'pasture'}, {housing: 'barn'}]
];
const completePair = (left, right) => [
  {...{diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, ...left},
  {...{diet: 'pasture', housing: 'pasture', weather: 'normal', supplement: 0}, ...right}
];

test('configured comparison supports each single configurable factor from one snapshot', () => {
  const engine = new FarmEngine(7301, 4);
  engine.tick(7);
  const snapshot = engine.snapshot();

  for (const [factor, left, right] of pairs) {
    const [referenceConfig, scenarioConfig] = completePair(left, right);
    const result = compareConfiguredScenarios(snapshot, {referenceConfig, scenarioConfig, days: 2});
    assert.equal(result.comparisonFactor, factor);
    assert.equal(result.seed, snapshot.initialSeed);
    assert.equal(result.validated, false);
    assert.deepEqual(result.referenceConfig, referenceConfig);
    assert.deepEqual(result.scenarioConfig, scenarioConfig);
    assert.equal(result.rows.length, 3);
  }
  assert.deepEqual(engine.snapshot(), snapshot, 'comparison must not mutate its shared input snapshot');
});

test('configured comparison and its versioned manifest replay deterministically', () => {
  const snapshot = new FarmEngine(991, 3).snapshot();
  const [referenceConfig, scenarioConfig] = completePair({weather: 'normal'}, {weather: 'rain'});
  const options = {referenceConfig, scenarioConfig, days: 3};
  const manifest = createConfiguredComparisonManifest(snapshot, options);
  const roundTrip = JSON.parse(JSON.stringify(manifest));

  assert.equal(manifest.type, 'riose-configured-comparison');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.factor, 'weather');
  assert.equal(manifest.seed, snapshot.initialSeed);
  assert.equal(manifest.validated, false);
  assert.equal(validateConfiguredComparisonManifest(roundTrip), true);
  const first = replayConfiguredComparisonManifest(roundTrip);
  const second = replayConfiguredComparisonManifest(JSON.parse(JSON.stringify(roundTrip)));
  assert.deepEqual(first, second);
  assert.deepEqual(first, compareConfiguredScenarios(snapshot, options));
});

test('lot context is tied to one isolated demo paddock and survives manifest replay validation',()=>{
  const source=new FarmEngine(661,12).snapshot(),lot=resolveDemoLot(source,1),snapshot=isolateDemoLotSnapshot(source,lot);
  const referenceConfig={...snapshot.config,diet:'pasture'},scenarioConfig={...snapshot.config,diet:'balanced'};
  const lotContext=createDemoLotContext(lot,'diet',referenceConfig,scenarioConfig);
  const manifest=createConfiguredComparisonManifest(snapshot,{referenceConfig,scenarioConfig,days:2});
  const decoded=JSON.parse(JSON.stringify(createDemoLotManifestEnvelope(manifest,lotContext)));
  assert.equal(validateDemoLotManifestEnvelope(decoded),true);
  assert.equal(validateConfiguredComparisonManifest(decoded.manifest),true);
  assert.deepEqual(replayConfiguredComparisonManifest(decoded.manifest),compareConfiguredScenarios(snapshot,{referenceConfig,scenarioConfig,days:2}));
  for(const mutate of [
    value=>{value.lotContext.lotId='demo-paddock-1';},
    value=>{value.lotContext.animalIds[0]=999;},
    value=>{value.lotContext.source='observed-study-slice';},
    value=>{value.lotContext.intervention.scenarioValue='concentrate';}
  ]){const invalid=structuredClone(decoded);mutate(invalid);assert.throws(()=>validateDemoLotManifestEnvelope(invalid),/Contexto de lote/);}
});

test('configured comparison rejects multiple config differences and invalid complete configs', () => {
  const snapshot = new FarmEngine(21, 2).snapshot();
  const [referenceConfig, scenarioConfig] = completePair({diet: 'pasture'}, {diet: 'balanced', weather: 'hot'});

  assert.throws(() => compareConfiguredScenarios(snapshot, {referenceConfig, scenarioConfig}), /exatamente um fator/);
  assert.throws(() => createConfiguredComparisonManifest(snapshot, {referenceConfig, scenarioConfig}), /exatamente um fator/);

  const invalid = {...scenarioConfig, supplement: 5};
  assert.throws(() => compareConfiguredScenarios(snapshot, {referenceConfig, scenarioConfig: invalid}), /Suplementação inválida/);
});

test('configured manifest rejects changed seed, factor declaration, or validated status', () => {
  const snapshot = new FarmEngine(44, 2).snapshot();
  const [referenceConfig, scenarioConfig] = completePair({supplement: 0}, {supplement: 2});
  const manifest = createConfiguredComparisonManifest(snapshot, {referenceConfig, scenarioConfig, days: 1});

  for (const mutate of [
    value => { value.seed += 1; },
    value => { value.factor = 'diet'; },
    value => { value.validated = true; }
  ]) {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(() => validateConfiguredComparisonManifest(changed));
  }
});

test('configured manifest rejects unsupported fields, scenario keys, and out-of-range seeds', () => {
  const snapshot = new FarmEngine(45, 2).snapshot();
  const [referenceConfig, scenarioConfig] = completePair({weather: 'normal'}, {weather: 'hot'});
  const manifest = createConfiguredComparisonManifest(snapshot, {referenceConfig, scenarioConfig, days: 1});

  const withUnknownField = structuredClone(manifest);
  withUnknownField.extra = true;
  assert.throws(() => validateConfiguredComparisonManifest(withUnknownField), /campos ausentes ou não suportados/);

  const withUnknownScenario = structuredClone(manifest);
  withUnknownScenario.scenarios.extra = referenceConfig;
  assert.throws(() => validateConfiguredComparisonManifest(withUnknownScenario), /somente as configurações/);

  const withOutOfRangeSeed = structuredClone(manifest);
  withOutOfRangeSeed.seed = 0x100000000;
  withOutOfRangeSeed.initialSnapshot.initialSeed = 0x100000000;
  withOutOfRangeSeed.initialSnapshot.seed = 0x100000000;
  assert.throws(() => validateConfiguredComparisonManifest(withOutOfRangeSeed));
});

test('legacy housing comparison and manifest replay retain their existing contract', () => {
  const snapshot = new FarmEngine(445, 4).snapshot();
  const manifest = createComparisonManifest(snapshot, 2);
  const oldResult = compare(snapshot, 2);

  assert.deepEqual(replayComparisonManifest(JSON.parse(JSON.stringify(manifest))), oldResult);
  assert.equal(oldResult.comparisonFactor, 'housing');
  assert.ok(oldResult.rows.every(row => 'baselineWeight' in row && 'scenarioWeight' in row));
});
