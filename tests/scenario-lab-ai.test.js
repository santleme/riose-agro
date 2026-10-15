import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretScenarioLabPrompt} from '../src/client/scenario-lab-intent.js';
import {interpretScenarioLabPromptWithProvider, validateScenarioLabInterpretationRequest} from '../src/server/scenario-lab-ai.js';
import {createServer} from '../src/server/server.js';

const prompt = 'Compare supplement levels 0.5 kg DM/head/day, 1.0 kg DM/head/day, and 1.5 kg DM/head/day for 200 cattle over 30 days in hot weather.';
const providerIntent = sourcePrompt => {
  const intent = interpretScenarioLabPrompt(sourcePrompt);
  intent.assumptions = intent.assumptions.map(item => item.field === 'supplementLevelsKgDMPerHeadPerDay' ? {...item, value: null} : item);
  return intent;
};

test('scenario-lab request contract is bounded and rejects extra fields', () => {
  assert.equal(validateScenarioLabInterpretationRequest({prompt}), true);
  assert.equal(validateScenarioLabInterpretationRequest({prompt: '  '}), false);
  assert.equal(validateScenarioLabInterpretationRequest({prompt: 'x'.repeat(1201)}), false);
  assert.equal(validateScenarioLabInterpretationRequest({prompt, tools: ['shell']}), false);
});

test('Groq adapter requests strict intent JSON and returns a separately validated proposal', async () => {
  let sent;
  const result = await interpretScenarioLabPromptWithProvider(prompt, {
    provider: 'groq', apiKey: 'server-only-test', model: 'openai/gpt-oss-20b',
    fetchImpl: async (url, request) => {
      sent = {url, request};
      return {ok: true, json: async () => ({choices: [{message: {content: JSON.stringify(providerIntent(prompt))}}]})};
    },
  });
  assert.equal(result.available, true);
  assert.equal(result.source, 'llm');
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.deepEqual(result.intent, interpretScenarioLabPrompt(prompt));
  assert.equal(sent.url, 'https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(sent.request.body);
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.equal(body.max_completion_tokens, 700);
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.tools, undefined);
  assert.match(body.messages[0].content, /untrusted data/);
  assert.equal(JSON.parse(body.messages[1].content).prompt, prompt);
  assert.equal(sent.request.headers.authorization, 'Bearer server-only-test');
});

test('unsupported user outcomes remain blocked even when the model omits them', async () => {
  const unsafePrompt = `${prompt} Predict exact weight gain.`;
  const result = await interpretScenarioLabPromptWithProvider(unsafePrompt, {
    provider: 'groq', apiKey: 'test', model: 'model',
    fetchImpl: async () => ({ok: true, json: async () => ({choices: [{message: {content: JSON.stringify(providerIntent(unsafePrompt))}}]})}),
  });
  assert.equal(result.intent.ready, false);
  assert.match(result.intent.unsupportedRequests.join(' '), /biological outcome/i);
});

test('provider output and server-side validation fail closed; missing credentials never call a provider', async () => {
  let calls = 0;
  const noKey = await interpretScenarioLabPromptWithProvider(prompt, {provider: 'groq', model: 'model', fetchImpl: async () => { calls++; }});
  assert.deepEqual(noKey, {available: false, source: 'deterministic', reason: 'provider_not_configured'});
  assert.equal(calls, 0);
  await assert.rejects(interpretScenarioLabPromptWithProvider(prompt, {
    provider: 'groq', apiKey: 'test', model: 'model', fetchImpl: async () => ({ok: true, json: async () => ({choices: [{message: {content: 'not-json'}}]})}),
  }), /invalid_scenario_lab_provider_json/);
  const invalid = providerIntent(prompt); invalid.supplementLevelsKgDMPerHeadPerDay[0] = 99;
  await assert.rejects(interpretScenarioLabPromptWithProvider(prompt, {
    provider: 'groq', apiKey: 'test', model: 'model', fetchImpl: async () => ({ok: true, json: async () => ({choices: [{message: {content: JSON.stringify(invalid)}}]})}),
  }), /intent is invalid/);
});

test('V4 endpoint uses server configuration and exposes neither key nor fallback execution authority', async t => {
  const server = createServer({env: {LLM_PROVIDER: 'groq'}, fetchImpl: async () => { throw new Error('must not contact provider without a key'); }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${root}/api/interpret-scenario-lab`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({prompt})});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {available: false, source: 'deterministic', reason: 'provider_not_configured'});
  const malformed = await fetch(`${root}/api/interpret-scenario-lab`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({prompt, execute: true})});
  assert.equal(malformed.status, 400);
});
