import {readFileSync} from 'node:fs';
import {assertBenchmarkReport} from './benchmark-report.mjs';

try {
  const report = JSON.parse(readFileSync(0, 'utf8'));
  assertBenchmarkReport(report);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
