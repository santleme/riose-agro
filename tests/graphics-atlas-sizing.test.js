import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [runtime, renderer] = await Promise.all([
  readFile(new URL('../public/assets/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../graphics-poc/assets/main-composer-render-manifest.json', import.meta.url), 'utf8').then(JSON.parse),
]);

test('atlas frame rectangles render at each asset declared displaySize', () => {
  const runtimeById = new Map(runtime.assets.map(asset => [asset.id, asset]));
  for (const asset of renderer.assets) {
    const runtimeAsset = runtimeById.get(asset.assetId);
    assert.ok(runtimeAsset, `${asset.assetId} is present in the runtime manifest`);
    assert.deepEqual(asset.displaySize, runtimeAsset.displaySize, `${asset.assetId} has one display-size source of truth`);
    assert.ok(asset.frame.w > 0 && asset.frame.h > 0, `${asset.assetId} has a valid atlas frame`);
    assert.ok(Math.abs(runtimeAsset.scaleHints.default * runtimeAsset.frame.w - runtimeAsset.displaySize[0]) < 1e-8,
      `${asset.assetId} runtime default scale derives from the actual atlas frame`);
    assert.ok(Math.abs(asset.scale * asset.frame.w - asset.displaySize[0]) < 1e-8,
      `${asset.assetId} compatibility scale derives from the actual atlas frame`);
    const renderedWidth = asset.frame.w * (asset.displaySize[0] / asset.frame.w);
    const renderedHeight = asset.frame.h * (asset.displaySize[1] / asset.frame.h);
    assert.equal(renderedWidth, asset.displaySize[0]);
    assert.equal(renderedHeight, asset.displaySize[1]);
  }
});

test('Graphics Lab uses declared displaySize and rejects missing runtime frame IDs', async () => {
  const source = await readFile(new URL('../graphics-poc/app.js', import.meta.url), 'utf8');
  assert.match(source, /function spriteDimensions\(meta\)[\s\S]*meta\.displaySize/);
  assert.match(source, /No runtime frame for \$\{assetId\}/);
  assert.doesNotMatch(source, /\?\? frames\['grass-light'\]/);
});
