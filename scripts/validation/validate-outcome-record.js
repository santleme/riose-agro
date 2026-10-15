#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateOutcomeRecord} from '../../src/client/outcome-record.js';

const args = process.argv.slice(2);
const archiveIndex = args.indexOf('--archive');
const manifestIndex = args.indexOf('--manifest');
const snapshotIndex = args.indexOf('--snapshot');
const archivePath = archiveIndex >= 0 ? args[archiveIndex + 1] : null;
const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : null;
const snapshotPath = snapshotIndex >= 0 ? args[snapshotIndex + 1] : null;
const excluded = new Set([archiveIndex + 1, manifestIndex + 1, snapshotIndex + 1]);
const outcomePath = args.find((arg, index) => !arg.startsWith('--') && !excluded.has(index));
const requireComparable = args.includes('--require-comparable');
const usage = 'Uso: npm run validate:outcome -- <registro.json> --archive <projecao.json> --manifest <manifesto.json> --snapshot <snapshot.json> [--require-comparable]';

if (!outcomePath || !archivePath || !manifestPath || !snapshotPath) {
  process.stderr.write(`${usage}\n`);
  process.exitCode = 1;
} else {
  try {
    const schemaPath = fileURLToPath(new URL('../../schemas/outcome-record.schema.json', import.meta.url));
    const snapshotSchemaPath = fileURLToPath(new URL('../../schemas/farm-snapshot.schema.json', import.meta.url));
    const record = JSON.parse(readFileSync(resolve(outcomePath), 'utf8'));
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const snapshotSchema = JSON.parse(readFileSync(snapshotSchemaPath, 'utf8'));
    const snapshot = JSON.parse(readFileSync(resolve(snapshotPath), 'utf8'));
    const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
    addFormats(ajv);
    const schemaValidator = ajv.compile(schema);
    const snapshotSchemaValidator = ajv.compile(snapshotSchema);
    const schemaValid = schemaValidator(record);
    const snapshotSchemaValid = snapshotSchemaValidator(snapshot);
    const report = validateOutcomeRecord(record, readFileSync(resolve(archivePath)), readFileSync(resolve(manifestPath)), readFileSync(resolve(snapshotPath)));
    report.schemaValid = schemaValid;
    report.snapshotSchemaValid = snapshotSchemaValid;
    report.errors = [
      ...(schemaValid ? [] : schemaValidator.errors.map(error => `${error.instancePath || '/'} ${error.message}`)),
      ...(snapshotSchemaValid ? [] : snapshotSchemaValidator.errors.map(error => `Snapshot ${error.instancePath || '/'} ${error.message}`)),
      ...report.errors,
    ];
    report.valid = schemaValid && snapshotSchemaValid && report.valid;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.valid || (requireComparable && !report.comparisons.some(item => item.status === 'comparable-descriptive'))) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage}\n`);
    process.exitCode = 1;
  }
}
