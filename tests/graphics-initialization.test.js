import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {initialGraphicsDomain, loadImageEntriesConcurrently} from '../graphics-poc/initialization.js';

const appSource = await readFile(new URL('../graphics-poc/app.js', import.meta.url), 'utf8');

test('normal scene deep links select dairy while default and fixture mode stay on beef', () => {
  assert.equal(initialGraphicsDomain('?scene=dairy', false), 'dairy');
  assert.equal(initialGraphicsDomain('', false), 'beef');
  assert.equal(initialGraphicsDomain('?scene=beef', false), 'beef');
  assert.equal(initialGraphicsDomain('?scene=dairy&benchmark-fixture=approved-livestock-v1', true), 'beef');
  assert.match(appSource, /initialGraphicsDomain\(location\.search, benchmarkFixtureMode\)/);
  assert.match(appSource, /if \(state\.selectedDomain === 'beef'\) \{[\s\S]*?new Worker\('\/src\/client\/worker\.js'/);
});

test('runtime atlas image entries begin loading concurrently and preserve key mapping', async () => {
  const entries = [['farm', '/farm.png'], ['dairy', '/dairy.png'], ['atlas', '/atlas.png']];
  const started = [];
  const releases = new Map();
  const loaded = loadImageEntriesConcurrently(entries, url => {
    started.push(url);
    return new Promise(resolve => releases.set(url, resolve));
  });

  assert.deepEqual(started, entries.map(([, url]) => url));
  for (const [key, url] of entries) releases.get(url)(key);
  assert.deepEqual(await loaded, {farm: 'farm', dairy: 'dairy', atlas: 'atlas'});
  assert.match(appSource, /fetch\('\/assets\/manifest\.json'\)/);
  assert.match(appSource, /const runtimeAtlasEntries = Object\.entries\(runtimeManifest\.atlases\)/);
  assert.match(appSource, /loadImageEntriesConcurrently\(runtimeAtlasEntries, image\)/);
  assert.doesNotMatch(appSource, /farm-starter-atlas\.png|handling-review-atlas-v1\.png|neloreUrl/);
});
