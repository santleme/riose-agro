#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPaths = [path.join(root, 'data/mendeley-pasture-biomass/manifest.json')];
const precisionBeefManifestPath = path.join(root, 'data/precision-beef/manifest.json');
if (fs.existsSync(precisionBeefManifestPath)) manifestPaths.push(precisionBeefManifestPath);
const schemaPath = path.join(root, 'schemas/scientific-data-manifest-v1.schema.json');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fail(message) {
  console.error(`Scientific data registry validation failed: ${message}`);
  process.exitCode = 1;
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
for (const manifestPath of manifestPaths) {
  if (!fs.existsSync(manifestPath)) {
    fail(`registered manifest is missing: ${path.relative(root, manifestPath)}`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!validate(manifest)) {
    fail(`${path.relative(root, manifestPath)}: ${JSON.stringify(validate.errors, null, 2)}`);
    continue;
  }

  const snapshotPath = path.join(root, manifest.metadataSnapshot);
  if (!fs.existsSync(snapshotPath) || sha256(snapshotPath) !== manifest.provenance.apiMetadataSha256) {
    fail(`${manifest.source.doi}: API metadata snapshot is missing or its checksum does not match the manifest`);
  }

  for (const file of manifest.files) {
    if (file.selectedForDownload) {
      const localPath = path.join(root, file.localPath);
      if (!fs.existsSync(localPath)) {
        console.warn(`${manifest.source.doi}: source file is registered and checksummed at acquisition but is not present locally: ${file.localPath}`);
      } else {
        const actual = sha256(localPath);
        if (actual !== file.sha256 || actual !== file.verifiedSha256) {
          fail(`${manifest.source.doi}: source file checksum mismatch: ${file.name}`);
        }
        if (fs.statSync(localPath).size !== file.sizeBytes) {
          fail(`${manifest.source.doi}: source file size mismatch: ${file.name}`);
        }
      }
    } else if (file.localPath !== null || file.retrievedOn !== null) {
      fail(`${manifest.source.doi}: omitted source file is incorrectly marked downloaded: ${file.name}`);
    }
  }

  for (const output of manifest.processedOutputs) {
    const outputPath = path.join(root, output.path);
    if (!fs.existsSync(outputPath)) {
      console.warn(`${manifest.source.doi}: processed output is registered but is not present locally: ${output.path}`);
      continue;
    }
    if (sha256(outputPath) !== output.sha256) {
      fail(`${manifest.source.doi}: processed output missing or checksum mismatch: ${output.path}`);
    }
    if (output.format === 'parquet' && fs.existsSync(outputPath)) {
      const bytes = fs.readFileSync(outputPath);
      if (bytes.subarray(0, 4).toString('ascii') !== 'PAR1' || bytes.subarray(-4).toString('ascii') !== 'PAR1') {
        fail(`${manifest.source.doi}: output does not have Parquet magic bytes: ${output.path}`);
      }
    }
  }

  const qualityPath = path.join(root, manifest.processingReport);
  const quality = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
  const expectedRows = manifest.processedOutputs.length
    ? manifest.processedOutputs.reduce((sum, output) => sum + output.rows, 0)
    : null;
  if (quality.sourceDoi !== manifest.source.doi || quality.totalRows !== expectedRows) {
    fail(`${manifest.source.doi}: quality report source identity or row count disagrees with manifest`);
  }
  if (manifest.use.dmiTargetEligible) {
    fail(`${manifest.source.doi}: a non-target cohort was incorrectly classified as mature-cow DMI eligible`);
  }
  if (manifest.source.doi === '10.17632/nj72kmdj77.1' && manifest.population.animalsObserved) {
    fail('forage-only Mendeley source was incorrectly classified as animal observation');
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Scientific data registry valid: ${manifestPaths.length} manifests; source files and available processed outputs checksum-verified.`);
