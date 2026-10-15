import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const assetDirectory = resolve(root, 'public/assets/farm-scene');
const scenePath = resolve(assetDirectory, 'scene.json');
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const schema = JSON.parse(readFileSync(resolve(root, 'schemas/farm-scene.schema.json'), 'utf8'));

assert.equal(scene.schemaVersion, schema.properties.schemaVersion.const, 'unsupported schema version');
assert.equal(scene.projection, schema.properties.projection.const, 'unsupported projection');
assert.ok(Number.isInteger(scene.world.width) && scene.world.width > 0, 'world width must be a positive integer');
assert.ok(Number.isInteger(scene.world.height) && scene.world.height > 0, 'world height must be a positive integer');
assert.ok(scene.camera.minZoom <= scene.camera.initialZoom && scene.camera.initialZoom <= scene.camera.maxZoom, 'initial camera zoom must be within bounds');

const ids = new Set();
const referencedAssets = new Set([scene.terrain.asset]);
for (const object of scene.objects) {
  assert.ok(!ids.has(object.id), `duplicate scene object id: ${object.id}`);
  ids.add(object.id);
  assert.ok(object.x >= 0 && object.x <= scene.world.width, `${object.id} x coordinate is outside the scene`);
  assert.ok(object.y >= 0 && object.y <= scene.world.height, `${object.id} y coordinate is outside the scene`);
  assert.ok(object.width > 0 && object.height > 0, `${object.id} dimensions must be positive`);
  referencedAssets.add(object.asset);
}

for (const asset of referencedAssets) {
  assert.match(asset, /^[a-z0-9-]+\.png$/, `unsafe or unsupported asset path: ${asset}`);
  assert.ok(existsSync(resolve(assetDirectory, asset)), `missing scene asset: ${asset}`);
}

const count = type => scene.objects.filter(object => object.type === type).length;
assert.equal(count('cattle'), 10, 'reference scene must contain exactly 10 visual cattle');
assert.equal(count('barn'), 1, 'reference scene must contain one barn');
assert.ok(count('fence') >= 1 && count('gate') >= 1, 'reference scene must include fencing and a gate');
assert.ok(count('water-trough') >= 1, 'reference scene must include a water trough');
assert.ok(count('feed-trough') >= 1, 'reference scene must include a feed trough');
assert.match(scene.terrain.description, /vegeta/i, 'terrain description should identify vegetation baked into the ground plate');

console.log(`Scene ${scene.id} valid: ${scene.objects.length} objects, ${count('cattle')} cattle, all assets present.`);
