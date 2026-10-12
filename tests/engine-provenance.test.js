import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {bundleEngineSources, ENGINE_SOURCE_FILES} from '../src/client/engine-provenance.js';
import {engineSourceSha256, readEngineSourceBundle} from '../scripts/engine-source-hash.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixtureSources() {
  return Object.fromEntries(ENGINE_SOURCE_FILES.map(filename => [filename, `source:${filename}\n`]));
}

test('engine provenance deterministically bundles every direct model source', () => {
  const sources = fixtureSources();
  const bundle = bundleEngineSources(sources);
  const engineSource = readFileSync(new URL('../src/client/engine.js', import.meta.url), 'utf8');
  const directModules = [...engineSource.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)].map(([, filename]) => filename);

  assert.deepEqual(directModules.sort(), ENGINE_SOURCE_FILES.filter(filename => filename !== 'engine.js').sort());
  assert.deepEqual(bundle, bundleEngineSources(sources));
  assert.equal(engineSourceSha256(), digest(readEngineSourceBundle()));
});

test('changes to feeding logic change the engine artifact fingerprint', () => {
  const original = fixtureSources();
  const changed = {...original, 'feeding-model.js': `${original['feeding-model.js']}changed`};

  assert.notEqual(digest(bundleEngineSources(original)), digest(bundleEngineSources(changed)));
});

test('source fingerprint normalizes checkout line endings and rejects missing modules', () => {
  const source = fixtureSources();
  const crlf = Object.fromEntries(ENGINE_SOURCE_FILES.map(filename => [filename, source[filename].replaceAll('\n', '\r\n')]));

  assert.equal(digest(bundleEngineSources(source)), digest(bundleEngineSources(crlf)));
  assert.throws(() => bundleEngineSources({'engine.js': source['engine.js']}), /Missing engine source/);
});
