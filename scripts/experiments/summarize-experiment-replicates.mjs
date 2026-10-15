#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseExperimentResultJsonl} from './batch-manifest.js';
import {summarizeExperimentReplicates} from './replicate-summary.js';

export async function summarizeExperimentFiles(manifestPath, resultsPath, outputPath, {groupBy = [], outputs} = {}) {
  const [manifestText, resultText] = await Promise.all([readFile(manifestPath, 'utf8'), readFile(resultsPath, 'utf8')]);
  const summary = summarizeExperimentReplicates(JSON.parse(manifestText), parseExperimentResultJsonl(resultText), {groupBy, outputs});
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function main() {
  const [manifestPath, resultsPath, outputPath, ...groupBy] = process.argv.slice(2);
  if (!manifestPath || !resultsPath) throw new Error('Usage: node scripts/experiments/summarize-experiment-replicates.mjs <batch-manifest.json> <batch-results.jsonl> [summary.json] [group-input-field ...]');
  const summary = await summarizeExperimentFiles(resolve(manifestPath), resolve(resultsPath), outputPath ? resolve(outputPath) : undefined, {groupBy});
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
