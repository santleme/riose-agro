import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FarmEngine, createComparisonManifest, replayComparisonManifest} from '../src/client/engine.js';

test('reconciled registry metadata leaves the legacy comparison manifest replay unchanged', () => {
  const engine = new FarmEngine(551, 5);
  engine.configure({housing: 'pasture', diet: 'balanced', supplement: 1.5, weather: 'rain'});
  engine.tick(48);
  const manifest = createComparisonManifest(engine.snapshot(), 17);
  const replay = replayComparisonManifest(manifest);
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

  assert.equal(hash(manifest), 'a3d2c246358cc7ca75e3ec4d512d65f474caadcfade1747d0d5165f11a024a4c');
  assert.equal(hash(replay), 'aa77c8889e5cf13e720a08855d7d0d42847341bc7dfecdf707c56daf46acfbe6');
  assert.deepEqual(replayComparisonManifest(JSON.parse(JSON.stringify(manifest))), replay);
});
