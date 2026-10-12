#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateFarmSnapshot} from '../src/client/snapshot-validator.js';
import {validateFarmSnapshotManifestReference} from '../src/client/snapshot-manifest-link.js';

const usage = 'Uso: npm run validate:snapshot -- <snapshot.json> [--manifest <comparacao.json>] [--require-eligible]';
const args = process.argv.slice(2);
const requireEligible = args.includes('--require-eligible');
const manifestIndex = args.indexOf('--manifest');
const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
const manifestValueIndex = manifestIndex >= 0 ? manifestIndex + 1 : -1;
const inputPath = args.find((arg, index) => !arg.startsWith('--') && index !== manifestValueIndex);

if (!inputPath || (manifestIndex >= 0 && !manifestPath)) {
  process.stderr.write(`${usage}\n`);
  process.exitCode = 1;
} else {
  try {
    const schemaPath = fileURLToPath(new URL('../schemas/farm-snapshot.schema.json', import.meta.url));
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const snapshot = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
    const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
    addFormats(ajv);
    const schemaValidator = ajv.compile(schema);
    const schemaValid = schemaValidator(snapshot);
    const semantic = validateFarmSnapshot(snapshot);
    const linkErrors = [];
    let manifestReferenceChecked = false;
    let manifestReferenceValid = snapshot.manifestReference?.status !== 'linked';
    if (snapshot.manifestReference?.status === 'linked') {
      manifestReferenceValid = false;
      if (!manifestPath) {
        linkErrors.push('Snapshot ligado a manifesto; informe o arquivo com --manifest para conferir SHA-256 e versão.');
      } else {
        const manifestBytes = readFileSync(resolve(manifestPath));
        const manifestCheck = validateFarmSnapshotManifestReference(snapshot, manifestBytes);
        manifestReferenceChecked = manifestCheck.checked;
        linkErrors.push(...manifestCheck.errors);
        manifestReferenceValid = manifestCheck.valid;
      }
    } else if (manifestPath) {
      manifestReferenceValid = false;
      linkErrors.push('Foi informado --manifest, mas o snapshot declara manifestReference.status=not-linked.');
    }
    const errors = [
      ...(schemaValid ? [] : schemaValidator.errors.map(error => `${error.instancePath || '/'} ${error.message}`)),
      ...semantic.errors,
      ...linkErrors,
    ];
    const simulationEligible = schemaValid && semantic.semanticValid && semantic.simulationEligible && manifestReferenceValid;
    const report = {
      file: resolve(inputPath),
      schemaValid,
      manifestReferenceChecked,
      manifestReferenceValid,
      valid: schemaValid && semantic.semanticValid && manifestReferenceValid,
      simulationEligible,
      errors,
      blockers: semantic.blockers,
      missingRequiredFields: semantic.missingRequiredFields,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.valid || (requireEligible && !simulationEligible)) process.exitCode = requireEligible && report.valid ? 2 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 1;
  }
}
