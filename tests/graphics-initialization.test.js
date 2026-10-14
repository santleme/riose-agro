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

test('normal-mode image entries begin loading concurrently and preserve key mapping', async () => {
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
  assert.match(appSource, /if \(benchmarkFixtureMode\) \{[\s\S]*?state\.assetImages = \{nelore:[\s\S]*?\} else \{[\s\S]*?loadImageEntriesConcurrently\(/);
  assert.match(appSource, /\['nelore', neloreUrl\][\s\S]*?\.\.\.atlasEntries/);
});
