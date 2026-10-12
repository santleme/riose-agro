import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG, FarmEngine, compare, createComparisonManifest, replayComparisonManifest, validateComparisonManifest} from '../src/client/engine.js';

test('same seed and actions reproduce the same farm state', () => {
  const first = new FarmEngine(417, 8);
  const second = new FarmEngine(417, 8);

  first.tick(72);
  second.tick(72);

  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('tick can skip its deep snapshot copy when the caller only needs current state', () => {
  const direct = new FarmEngine(81, 20);
  const noSnapshot = new FarmEngine(81, 20);
  const returnedSnapshot = direct.tick(24);

  assert.equal(noSnapshot.tick(24, undefined, false), undefined);
  assert.deepEqual(noSnapshot.snapshot(), returnedSnapshot);
});

test('housing changes consume locomotion randomness without advancing the model seed', () => {
  const changed = new FarmEngine(417, 8);
  const unchanged = new FarmEngine(417, 8);
  const modelSeed = changed.state.seed;
  const locomotionSeed = changed.state.locomotionSeed;

  changed.configure({housing: 'barn'});
  changed.tick(3);

  assert.equal(changed.state.seed, modelSeed);
  assert.notEqual(changed.state.locomotionSeed, locomotionSeed);
  assert.equal(changed.random(), unchanged.random());
});

test('legacy snapshots get a deterministic locomotion stream without being mutated', () => {
  const legacySnapshot = new FarmEngine(81, 3).snapshot();
  delete legacySnapshot.locomotionSeed;
  const original = structuredClone(legacySnapshot);
  const first = FarmEngine.from(legacySnapshot);
  const second = FarmEngine.from(legacySnapshot);

  assert.deepEqual(legacySnapshot, original);
  assert.ok(Number.isInteger(first.state.locomotionSeed));
  assert.equal(first.state.locomotionSeed, second.state.locomotionSeed);
  first.tick(24);
  second.tick(24);
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('comparison keeps the initial snapshot and changes housing only', () => {
  const engine = new FarmEngine(2026, 12);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(24);
  const start = engine.snapshot();

  const result = compare(start, 30);
  const baseline = result.baselineConfig;
  const scenario = result.scenarioConfig;

  assert.equal(result.comparisonFactor, 'housing');
  assert.equal(baseline.housing, 'pasture');
  assert.equal(scenario.housing, 'barn');
  assert.deepEqual({...baseline, housing: DEFAULT_CONFIG.housing}, {...scenario, housing: DEFAULT_CONFIG.housing});
  assert.deepEqual(engine.snapshot(), start);
  assert.equal(result.rows[0].baselineWeight, result.rows[0].scenarioWeight);
  assert.deepEqual(result.initialConfig, start.config);
  assert.equal(result.herdSize, start.animals.length);
});

test('frozen 30-day housing comparison preserves the main scenario outputs', () => {
  // Baseline captured from main@764ead1f4cdc8c011adcc22d16b92f4681c15c92.
  const engine = new FarmEngine(2026, 12);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(24);
  const start = engine.snapshot();
  const result = compare(start, 30);

  assert.deepEqual({
    hour: start.hour,
    seed: start.initialSeed,
    snapshotSeed: start.seed,
    herdSize: start.animals.length,
    config: start.config,
    days: result.days,
    comparisonFactor: result.comparisonFactor,
    baselineConfig: result.baselineConfig,
    scenarioConfig: result.scenarioConfig,
    startWeight: result.startWeight,
    day0: {
      baselineWeight: result.rows[0].baselineWeight,
      scenarioWeight: result.rows[0].scenarioWeight,
      baselinePastureByPaddock: result.rows[0].baselinePastureByPaddock,
    },
    day30: {
      baselineWeight: result.rows[30].baselineWeight,
      scenarioWeight: result.rows[30].scenarioWeight,
      baselineCost: result.rows[30].baselineCost,
      scenarioCost: result.rows[30].scenarioCost,
      baselineConsumptionKgDM: result.rows[30].baselineConsumptionKgDM,
      scenarioConsumptionKgDM: result.rows[30].scenarioConsumptionKgDM,
      baselineIntakeBySourceKgDM: result.rows[30].baselineIntakeBySourceKgDM,
      scenarioIntakeBySourceKgDM: result.rows[30].scenarioIntakeBySourceKgDM,
      baselinePastureByPaddock: result.rows[30].baselinePastureByPaddock,
      scenarioPastureByPaddock: result.rows[30].scenarioPastureByPaddock,
    },
  }, {
    hour: 30,
    seed: 2026,
    snapshotSeed: 717351974,
    herdSize: 12,
    config: {diet: 'balanced', housing: 'pasture', weather: 'rain', supplement: 1.5},
    days: 30,
    comparisonFactor: 'housing',
    baselineConfig: {diet: 'balanced', housing: 'pasture', weather: 'rain', supplement: 1.5},
    scenarioConfig: {diet: 'balanced', housing: 'barn', weather: 'rain', supplement: 1.5},
    startWeight: 358.56183703193625,
    day0: {
      baselineWeight: 358.56183703193625,
      scenarioWeight: 358.56183703193625,
      baselinePastureByPaddock: [1822.1597835193509, 1821.1163296029742, 1822.3504389228774, 1820.9682525876965],
    },
    day30: {
      baselineWeight: 405.3761344270324,
      scenarioWeight: 405.3761344270324,
      baselineCost: 2008.80000000025,
      scenarioCost: 3993.8655849398147,
      baselineConsumptionKgDM: 4241.947053752924,
      scenarioConsumptionKgDM: 4241.9470537529305,
      baselineIntakeBySourceKgDM: {
        pastureKgDM: 3053.947053752883,
        barnBaseKgDM: 0,
        supplementKgDM: 540,
        dietExtraKgDM: 648.0000000000409,
        totalKgDM: 4241.947053752924,
      },
      scenarioIntakeBySourceKgDM: {
        pastureKgDM: 0,
        barnBaseKgDM: 3053.9470537528896,
        supplementKgDM: 540,
        dietExtraKgDM: 648.0000000000409,
        totalKgDM: 4241.9470537529305,
      },
      baselinePastureByPaddock: [2398.896533680655, 2398.850814106909, 2398.904887364172, 2398.844326021605],
      scenarioPastureByPaddock: [2400, 2400, 2400, 2400],
    },
  });

  const assertFinite = (value, path = 'result') => {
    if (typeof value === 'number') {
      assert.ok(Number.isFinite(value), `${path} must be finite; got ${value}`);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => assertFinite(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) assertFinite(item, `${path}.${key}`);
    }
  };
  assert.ok(Array.isArray(result.rows), 'comparison rows must be an array');
  assert.equal(result.rows.length, 31, '30-day comparison includes day 0 and day 30');
  assertFinite(result);

  const assertLedger = (ledger, day, label) => {
    const sources = ledger.pastureKgDM + ledger.barnBaseKgDM + ledger.supplementKgDM + ledger.dietExtraKgDM;
    assert.ok(Math.abs(sources - ledger.totalKgDM) < 1e-8, `day ${day} ${label} intake ledger must balance`);
  };
  for (const [index, row] of result.rows.entries()) {
    assert.equal(row.day, index, `comparison row ${index} must identify its day`);
    assert.equal(row.baselinePastureByPaddock.length, 4, `day ${row.day} baseline must have four paddocks`);
    assert.equal(row.scenarioPastureByPaddock.length, 4, `day ${row.day} scenario must have four paddocks`);
    assert.ok(row.baselineWeight >= 200, `day ${row.day} baseline weight must respect the engine floor`);
    assert.ok(row.scenarioWeight >= 200, `day ${row.day} scenario weight must respect the engine floor`);
    for (const stock of [...row.baselinePastureByPaddock, ...row.scenarioPastureByPaddock]) {
      assert.ok(stock >= 0 && stock <= 2400, `day ${row.day} paddock stock must remain within 0–2400 kg DM`);
    }
    assertLedger(row.baselineIntakeBySourceKgDM, row.day, 'baseline');
    assertLedger(row.scenarioIntakeBySourceKgDM, row.day, 'scenario');
  }
  assert.deepEqual(engine.snapshot(), start, 'comparison must not mutate its frozen starting input');
});

test('scenario comparison repeats with the same input and period', () => {
  const engine = new FarmEngine(903, 6);
  engine.configure({housing: 'barn', diet: 'concentrate', supplement: 2, weather: 'hot'});
  engine.tick(36);
  const start = engine.snapshot();

  assert.deepEqual(compare(start, 14), compare(start, 14));
  assert.equal(compare(start, 14).rows.length, 15);
});

test('comparison manifests preserve the seed, starting snapshot, period, and both configs', () => {
  const engine = new FarmEngine(2741, 5);
  engine.configure({diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(48);
  const start = engine.snapshot();
  const manifest = createComparisonManifest(start, 17);
  const restored = JSON.parse(JSON.stringify(manifest));

  assert.equal(restored.seed, start.initialSeed);
  assert.deepEqual(restored.initialSnapshot, start);
  assert.equal(restored.periodDays, 17);
  assert.equal(restored.factor, 'housing');
  assert.deepEqual(restored.scenarios.reference, {...start.config, housing: 'pasture'});
  assert.deepEqual(restored.scenarios.scenario, {...start.config, housing: 'barn'});
  assert.equal(validateComparisonManifest(restored), true);
  assert.deepEqual(replayComparisonManifest(restored), replayComparisonManifest(restored));
  assert.deepEqual(replayComparisonManifest(restored), compare(start, 17));
  assert.deepEqual(engine.snapshot(), start);
});

test('comparison manifest replay reproduces all detailed outputs', () => {
  const snapshot = new FarmEngine(445, 4).snapshot();
  const manifest = createComparisonManifest(snapshot, 3);
  const first = replayComparisonManifest(manifest);
  const second = replayComparisonManifest(JSON.parse(JSON.stringify(manifest)));
  assert.deepEqual(first, second);
  assert.deepEqual(first.initialConfig, manifest.initialSnapshot.config);
  assert.equal(first.herdSize, manifest.initialSnapshot.animals.length);
  assert.ok(first.rows.at(-1).baselineConsumptionKgDM > 0);
  assert.equal(first.rows.at(-1).baselinePastureByPaddock.length, 4);
});

test('comparison manifests reject scenarios that change undeclared factors', () => {
  const manifest = createComparisonManifest(new FarmEngine(44, 2).snapshot(), 3);
  manifest.scenarios.scenario.weather = 'hot';

  assert.throws(() => validateComparisonManifest(manifest), /diferir somente no fator declarado/);
});

test('comparison manifests reject shared non-factor settings that differ from the initial snapshot', () => {
  const manifest = createComparisonManifest(new FarmEngine(44, 2).snapshot(), 3);
  manifest.scenarios.reference.diet = 'balanced';
  manifest.scenarios.scenario.diet = 'balanced';

  assert.throws(() => validateComparisonManifest(manifest), /corresponder ao snapshot inicial/);
});

test('activity history records the rule inputs for every animal', () => {
  const engine = new FarmEngine(11, 2);
  assert.equal(engine.snapshot().events.length, 1, 'initial activity belongs in each animal history, not the global event feed');
  engine.configure({weather: 'hot'});
  engine.tick(6);
  const snapshot = engine.snapshot();

  for (const animal of snapshot.animals) {
    const initial = animal.history[0];
    const thirstEvent = animal.history.find(record => record.reason === 'thirst_threshold');
    assert.equal(initial.reason, 'pasture_housing');
    assert.equal(initial.observed.housing, 'pasture');
    assert.ok(thirstEvent);
    assert.ok(thirstEvent.observed.thirst > 65);
    assert.equal(thirstEvent.action, 'drinking');
  }
});

test('activity histories replay deterministically with the same seed', () => {
  const first = new FarmEngine(72, 4);
  const second = new FarmEngine(72, 4);
  for (const engine of [first, second]) {
    engine.configure({housing: 'barn', weather: 'hot'});
    engine.tick(30);
  }
  assert.deepEqual(first.snapshot().animals.map(animal => animal.history), second.snapshot().animals.map(animal => animal.history));
});

test('activity history ring retains the latest 40 entries in snapshot order',()=>{
  const engine=new FarmEngine(45,1),animal=engine.state.animals[0],expected=engine.snapshot().animals[0].history;
  const actions=['grazing','feeding','drinking','resting'];
  for(let hour=1;hour<=100;hour++){
    engine.state.hour=hour;animal.action=actions[hour%actions.length];
    const reason='history_test_'+hour,observedThirst=hour%101;
    expected.push({hour,action:animal.action,reason,observed:{hour:hour%24,thirst:observedThirst,housing:engine.state.config.housing}});
    if(expected.length>40)expected.shift();
    engine.recordActivity(animal,reason,observedThirst,false);
  }
  const snapshot=engine.snapshot();
  assert.deepEqual(snapshot.animals[0].history,expected);
  assert.equal(Object.hasOwn(snapshot.animals[0],'historyNext'),false);
  assert.deepEqual(engine.historyFor(animal),expected);
  assert.deepEqual(FarmEngine.from(snapshot).snapshot(),snapshot);
});

test('comparison reports simulated intake and pasture stock by paddock', () => {
  const engine = new FarmEngine(93, 4);
  engine.configure({diet: 'balanced', supplement: 1});
  engine.tick(24);
  const start = engine.snapshot();
  const result = compare(start, 3);
  const end = result.rows.at(-1);

  assert.equal(result.initialPastureByPaddock.length, 4);
  assert.equal(end.baselinePastureByPaddock.length, 4);
  assert.equal(end.scenarioPastureByPaddock.length, 4);
  assert.equal(result.rows[0].baselineConsumptionKgDM, 0);
  assert.equal(result.rows[0].scenarioConsumptionKgDM, 0);
  assert.ok(end.baselineConsumptionKgDM > 0);
  assert.ok(end.scenarioConsumptionKgDM > 0);
  assert.ok(end.baselinePastureKgDM < end.scenarioPastureKgDM);
  assert.deepEqual(engine.snapshot(), start);
});

test('intake ledger separates pasture, confinement base feed, supplement, and diet extra', () => {
  const pasture = new FarmEngine(21, 3);
  pasture.configure({diet: 'balanced', supplement: 1.5});
  pasture.tick(24);
  const pastureIntake = pasture.metrics().intake;
  assert.ok(pastureIntake.pastureKgDM > 0);
  assert.equal(pastureIntake.barnBaseKgDM, 0);
  assert.ok(pastureIntake.supplementKgDM > 0);
  assert.ok(pastureIntake.dietExtraKgDM > 0);
  assert.equal(pastureIntake.totalKgDM, pastureIntake.pastureKgDM + pastureIntake.supplementKgDM + pastureIntake.dietExtraKgDM);

  const barn = FarmEngine.from(pasture.snapshot());
  barn.configure({housing: 'barn'});
  barn.tick(24);
  const barnIntake = barn.metrics().intake;
  assert.ok(barnIntake.barnBaseKgDM > 0);
  assert.equal(barnIntake.pastureKgDM, pastureIntake.pastureKgDM);
});
