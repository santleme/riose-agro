import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFAULT_CONFIG, FarmEngine, createComparisonManifest, metrics, replayComparisonManifest} from '../src/client/engine.js';
import {DEFAULT_WEATHER, WEATHER_VALUES, getEnvironmentalStress, getWeatherRules, isWeather} from '../src/client/environment-model.js';

const expectedRules = {
  normal: {label: 'ameno', heatMultiplier: 1, pastureGrowthMultiplier: 1, thirstPerHour: 5},
  hot: {label: 'calor', heatMultiplier: 0.8, pastureGrowthMultiplier: 0.65, thirstPerHour: 9},
  rain: {label: 'chuva', heatMultiplier: 1, pastureGrowthMultiplier: 1.3, thirstPerHour: 5}
};

test('environment model preserves the existing weather rules and accepted values', () => {
  assert.equal(DEFAULT_WEATHER, 'normal');
  assert.equal(DEFAULT_CONFIG.weather, DEFAULT_WEATHER);
  assert.deepEqual(WEATHER_VALUES, ['normal', 'hot', 'rain']);

  for (const weather of WEATHER_VALUES) {
    assert.equal(isWeather(weather), true);
    assert.deepEqual(getWeatherRules(weather), expectedRules[weather]);
  }
  assert.equal(isWeather('storm'), false);
  assert.throws(() => getWeatherRules('storm'), /Invalid weather/);
});

test('environment stress keeps the previous weather and housing precedence', () => {
  assert.equal(getEnvironmentalStress('hot', 'barn'), 28);
  assert.equal(getEnvironmentalStress('normal', 'barn'), 12);
  assert.equal(getEnvironmentalStress('rain', 'pasture'), 5);
});

test('engine config retains legacy invalid-weather behavior without mutating state', () => {
  const engine = new FarmEngine(417, 4);
  const before = engine.snapshot();

  assert.throws(() => engine.configure({weather: 'storm'}), {message: 'Invalid configuration'});
  assert.deepEqual(engine.snapshot(), before);

  const manifest = createComparisonManifest(before, 1);
  manifest.initialSnapshot.config.weather = 'storm';
  assert.throws(() => replayComparisonManifest(manifest), /Configuração inválida no snapshot: weather/);
});

test('fixed weather inputs preserve legacy snapshots, metrics, and replay outputs', () => {
  const expected = {
    normal: {
      snapshot: '956d1fa4dbf1f6ed2dac161584180a1b4bd780d82f08a8d05391ef3a8b28de63',
      metrics: '81bffd546da5a79ed6c9c6d94facd3e8cd1703b575c86950ad04ec97101c7a1f',
      comparison: '03c44b9af2a211913a42cddb593c87737f7ae3c433f0a52a89d7fc3832da00b1'
    },
    hot: {
      snapshot: 'be09a6264c264f66c389cf2b831b2c2dea97fa396b8298932361f06ee9b17c5b',
      metrics: '16e2ec761072cdc7d4d660878eab63c43c5e5a148c9335ad80a5ef9a2249030c',
      comparison: '446d2e734046268f9039608e71300e5f1a7fe02d3c663954cb6a9ee601f44e6e'
    },
    rain: {
      snapshot: 'fa37ffef1ff50b39f96a6248584c3385b0efde3b3d154e9e1b4ef2d5c5a2b993',
      metrics: '9305f1f6f604adbabf4129e67eea84bafbe8d0079b60102e9772383968a4fa30',
      comparison: 'e67b77dd4a0282c3a9159a414554f3aea77e5411c29f0f6f55f2e18679b18ab5'
    }
  };
  const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

  for (const weather of WEATHER_VALUES) {
    const engine = new FarmEngine(417, 4);
    engine.configure({weather});
    engine.tick(48);
    const snapshot = engine.snapshot();
    const manifest = createComparisonManifest(snapshot, 3);

    assert.equal(fingerprint(snapshot), expected[weather].snapshot, `${weather} snapshot`);
    assert.equal(fingerprint(metrics(snapshot)), expected[weather].metrics, `${weather} metrics`);
    assert.equal(fingerprint(replayComparisonManifest(manifest)), expected[weather].comparison, `${weather} replay`);
  }
});
