import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {classifyIntentLocally} from '../../src/client/decision-plan.js';
import {interpretScenarioLabPrompt} from '../../src/client/scenario-lab-intent.js';
const bytes = await readFile('tests/fixtures/intent-routing-v1.json');
const fixture = JSON.parse(bytes);
const cases = fixture.cases.map(row => {
  const started = performance.now(); const label = classifyIntentLocally(row.prompt); const latencyMs = performance.now() - started;
  const oldParser = interpretScenarioLabPrompt(row.prompt);
  return {...row, label, latencyMs, existingScenarioParserReady: oldParser.ready};
});
await writeFile('docs/evidence/deterministic-routing-v1.json', JSON.stringify({type: 'riose-deterministic-routing-evaluation', version: 1,
  fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
  baseline: 'New conservative lexical routing wrapper. The unchanged existing scenario parser has no eight-class classifier interface; its ready flag is also reported. Tiny single-call timings are descriptive, not a controlled latency benchmark.', cases}, null, 2) + '\n');
