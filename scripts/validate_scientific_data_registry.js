#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'data/mendeley-pasture-biomass/manifest.json');
const schemaPath = path.join(root, 'schemas/scientific-data-manifest-v1.schema.json');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fail(message) {
  console.error(`Scientific data registry validation failed: ${message}`);
  process.exitCode = 1;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(manifest)) {
  fail(JSON.stringify(validate.errors, null, 2));
} else {
  const snapshotPath = path.join(root, manifest.metadataSnapshot);
  if (!fs.existsSync(snapshotPath) || sha256(snapshotPath) !== manifest.provenance.apiMetadataSha256) {
    fail('API metadata snapshot is missing or its checksum does not match the manifest');
  }

  for (const file of manifest.files) {
    if (file.selectedForDownload) {
      const localPath = path.join(root, file.localPath);
      if (!fs.existsSync(localPath)) {
        fail(`selected source file is missing: ${file.localPath}`);
      } else {
        const actual = sha256(localPath);
        if (actual !== file.sha256 || actual !== file.verifiedSha256) {
          fail(`source file checksum mismatch: ${file.name}`);
        }
        if (fs.statSync(localPath).size !== file.sizeBytes) {
          fail(`source file size mismatch: ${file.name}`);
        }
      }
    } else if (file.localPath !== null || file.retrievedOn !== null) {
      fail(`omitted source file is incorrectly marked downloaded: ${file.name}`);
    }
  }

  for (const output of manifest.processedOutputs) {
    const outputPath = path.join(root, output.path);
    if (!fs.existsSync(outputPath) || sha256(outputPath) !== output.sha256) {
      fail(`processed output missing or checksum mismatch: ${output.path}`);
    }
    if (output.format === 'parquet' && fs.existsSync(outputPath)) {
      const bytes = fs.readFileSync(outputPath);
      if (bytes.subarray(0, 4).toString('ascii') !== 'PAR1' || bytes.subarray(-4).toString('ascii') !== 'PAR1') {
        fail(`output does not have Parquet magic bytes: ${output.path}`);
      }
    }
  }

  const qualityPath = path.join(root, manifest.processingReport);
  const quality = JSON.parse(fs.readFileSync(qualityPath, 'utf8'));
  if (quality.sourceDoi !== manifest.source.doi || quality.totalRows !== manifest.processedOutputs[0]?.rows) {
    fail('quality report source identity or row count disagrees with manifest');
  }
  if (manifest.population.animalsObserved || manifest.use.dmiTargetEligible) {
    fail('forage-only source was incorrectly classified as animal observation or DMI target eligible');
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Scientific data registry valid: ${manifest.source.doi}; ${manifest.files.filter(file => file.selectedForDownload).length} source files checksum-verified; ${manifest.processedOutputs[0].rows} Parquet rows.`);
