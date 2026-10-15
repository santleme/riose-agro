import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleEngineSources, ENGINE_SOURCE_FILES} from '../../../src/client/engine-provenance.js';

export {ENGINE_SOURCE_FILES};

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function readEngineSourceBundle(root = ROOT) {
  const sources = new Map(ENGINE_SOURCE_FILES.map(filename => [filename, readFileSync(resolve(root, 'src/client', filename))]));
  return bundleEngineSources(sources);
}

export function engineSourceSha256(root = ROOT) {
  return createHash('sha256').update(readEngineSourceBundle(root)).digest('hex');
}
