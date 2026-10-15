#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {EXECUTOR_PROFILE_VERSION} from '../../src/server/experiment-executor.js';

export function createExecutorProfile(reports, evidence, {animalCount = 3} = {}) {
  const inputs = Array.isArray(reports) ? reports : [reports];
  if (inputs.length === 0) throw new TypeError('executor profile requires at least one v2 scenario scheduler report');
  const records = [];
  let environment;
  let sourceRevision;
  for (const report of inputs) {
    if (report?.benchmark?.name !== 'scenario-scheduler-concurrency'
        || report.format !== 'riose-scenario-scheduler-benchmark-v2') {
      throw new TypeError('executor profile requires v2 scenario scheduler benchmark reports');
    }
    if (report.benchmark.source?.dirty !== false) {
      throw new TypeError('executor profile requires benchmarks captured from a clean source revision');
    }
    const cpu = report.hardware?.cpu;
    const rows = report.results?.rows;
    if (!cpu || !Array.isArray(rows) || rows.length === 0) throw new TypeError('benchmark report is missing hardware or scheduler measurements');
    const reportEnvironment = {platform: report.runtime.platform, arch: report.hardware.architecture, node: report.runtime.node, cpu};
    if (environment && JSON.stringify(environment) !== JSON.stringify(reportEnvironment)) throw new TypeError('executor profile reports must use the same runtime and host');
    if (sourceRevision && sourceRevision !== report.benchmark.source.revision) throw new TypeError('executor profile reports must use the same source revision');
    environment = reportEnvironment;
    sourceRevision = report.benchmark.source.revision;
    for (const row of rows) {
      if (row.allPassed !== true || !Number.isSafeInteger(row.sampleCount) || row.sampleCount < 3
          || !Number.isFinite(row.p95EndToEndMs) || row.p95EndToEndMs <= 0
          || !Number.isFinite(row.p95PeakObservedRssBytes) || row.p95PeakObservedRssBytes <= 0) {
      throw new TypeError('every profile row must have passed parity, a positive p95, and a measured RSS value');
      }
      records.push({
        operation: 'scenario-batch',
        scenarioCount: row.scenarioCount,
        animalCount,
        hours: report.results.workload.hours,
        backend: 'local-js',
        concurrency: row.concurrency,
        p95EndToEndMs: row.p95EndToEndMs,
        sampleCount: row.sampleCount,
        peakRssBytes: row.p95PeakObservedRssBytes,
        estimatedCostUsd: 0,
        parity: 'passed',
        status: 'measured',
        evidence: typeof evidence === 'function' ? evidence(report) : evidence,
      });
    }
  }
  return {
    version: EXECUTOR_PROFILE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceRevision,
    environment,
    records,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || inputs.length === 0) throw new Error('usage: node scripts/benchmarks/create-executor-profile.mjs <profile.json> <scheduler-report.json> [scheduler-report.json ...]');
  const reports = await Promise.all(inputs.map(async input => JSON.parse(await readFile(resolve(input), 'utf8'))));
  const profile = createExecutorProfile(reports, report => inputs[reports.indexOf(report)]);
  const outputPath = resolve(output);
  await import('node:fs/promises').then(({mkdir}) => mkdir(dirname(outputPath), {recursive: true}));
  await writeFile(outputPath, `${JSON.stringify(profile, null, 2)}\n`);
  process.stdout.write(`Wrote ${profile.records.length} measured executor records to ${outputPath}\n`);
}
