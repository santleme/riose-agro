#!/usr/bin/env node
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {linkFarmSnapshotToManifest} from '../src/client/snapshot-manifest-link.js';

const usage = 'Uso: npm run link:snapshot -- --snapshot <snapshot.json> --manifest <comparacao.json> --output <snapshot-vinculado.json>';
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const snapshotPath = option('--snapshot');
const manifestPath = option('--manifest');
const outputPath = option('--output');

if (!snapshotPath || !manifestPath || !outputPath) {
  process.stderr.write(`${usage}\n`);
  process.exitCode = 1;
} else {
  try {
    const schemaPath = fileURLToPath(new URL('../schemas/farm-snapshot.schema.json', import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
    addFormats(ajv);
    const validateSchema = ajv.compile(schema);

    const snapshot = JSON.parse(readFileSync(resolve(snapshotPath), 'utf8'));
    if (!validateSchema(snapshot)) {
      const errors = validateSchema.errors.map(error => `${error.instancePath || '/'} ${error.message}`);
      throw new Error(`Snapshot não corresponde ao JSON Schema:\n${errors.join('\n')}`);
    }
    const semantic = validateFarmSnapshot(snapshot);
    if (!semantic.semanticValid) throw new Error(`Snapshot tem erros semânticos:\n${semantic.errors.join('\n')}`);

    const manifestBytes = readFileSync(resolve(manifestPath));
    const linked = linkFarmSnapshotToManifest(snapshot, manifestBytes);
    if (!validateSchema(linked)) throw new Error('Snapshot vinculado não corresponde ao JSON Schema.');
    const linkedSemantic = validateFarmSnapshot(linked);
    if (!linkedSemantic.semanticValid) throw new Error(`Snapshot vinculado tem erros semânticos:\n${linkedSemantic.errors.join('\n')}`);

    const targetPath = resolve(outputPath);
    writeFileSync(targetPath, `${JSON.stringify(linked, null, 2)}\n`, {flag: 'wx'});
    process.stdout.write(`${JSON.stringify({
      output: targetPath,
      snapshotId: linked.snapshotId,
      manifestType: linked.manifestReference.type,
      manifestVersion: linked.manifestReference.version,
      manifestSha256: linked.manifestReference.sha256,
      simulationEligible: linkedSemantic.simulationEligible,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 1;
  }
}
