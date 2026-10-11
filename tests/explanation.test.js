import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, deterministicExplanation, explain, validateExplanationInput} from '../server.js';

const input = {
  hour: 30,
  config: {diet: 'balanced', housing: 'pasture', weather: 'normal', supplement: 1},
  metrics: {weight: 362.5, gain: 2.5, cost: 34, pasture: 7100, stress: 5},
};

test('explanation input accepts the engine state shape and rejects invalid config values', () => {
  assert.equal(validateExplanationInput(input), true);
  assert.equal(validateExplanationInput({...input, config: {...input.config, housing: 'unknown'}}), false);
  assert.equal(validateExplanationInput({...input, metrics: {...input.metrics, weight: Infinity}}), false);
});

test('deterministic explanation is local and explicitly not a measurement', async () => {
  const result = await explain(input);
  assert.equal(result.source, 'deterministic');
  assert.match(result.label, /não medido/);
  assert.match(result.text, /peso médio de 362\.5 kg/);
  assert.match(deterministicExplanation(input), /não são medições/);
});

test('OpenAI provider is optional, bounded, and returns only explanatory text', async () => {
  let request;
  const result = await explain(input, {
    provider: 'openai',
    apiKey: 'server-secret',
    fetchImpl: async (url, options) => {
      request = {url, options};
      return {ok: true, json: async () => ({output_text: 'O peso médio estimado é 362,5 kg.'})};
    },
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.authorization, 'Bearer server-secret');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 160);
  assert.equal(body.input.includes('server-secret'), false);
  assert.equal(result.source, 'llm');
  assert.match(result.label, /não medido/);
  assert.match(result.text, /peso médio estimado/);
});

test('Groq and Hugging Face providers use bounded chat-completion adapters', async () => {
  const cases = [
    {provider: 'groq', model: 'openai/gpt-oss-20b', url: 'https://api.groq.com/openai/v1/chat/completions', limitField: 'max_completion_tokens'},
    {provider: 'huggingface', model: 'openai/gpt-oss-120b:cheapest', url: 'https://router.huggingface.co/v1/chat/completions', limitField: 'max_tokens'},
  ];
  for (const item of cases) {
    let request;
    const result = await explain(input, {
      provider: item.provider,
      apiKey: 'provider-secret',
      model: item.model,
      fetchImpl: async (url, options) => {
        request = {url, options};
        return {ok: true, json: async () => ({choices: [{message: {content: 'Explicação curta.'}}]})};
      },
    });
    const body = JSON.parse(request.options.body);
    assert.equal(request.url, item.url);
    assert.equal(request.options.headers.authorization, 'Bearer provider-secret');
    assert.equal(body.model, item.model);
    assert.equal(body[item.limitField], 160);
    assert.equal(body.stream, false);
    assert.deepEqual(JSON.parse(body.messages[1].content), input);
    assert.doesNotMatch(body.messages.map(message => message.content).join(' '), /provider-secret/);
    assert.equal(result.source, 'llm');
    assert.equal(result.text, 'Explicação curta.');
    assert.match(result.label, /não medido/);
  }
});

test('provider errors fall back without exposing provider details', async () => {
  const result = await explain(input, {
    provider: 'openai',
    apiKey: 'server-secret',
    fetchImpl: async () => ({ok: false, status: 401, text: async () => 'secret diagnostic'}),
  });
  assert.equal(result.source, 'deterministic');
  assert.doesNotMatch(JSON.stringify(result), /secret|401/);
});

test('HTTP endpoint validates input and works without an API key', async t => {
  const server = createServer({env: {}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/explain`;

  const page = await fetch(url.replace('/api/explain', '/'));
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Agroville/);
  const backendFile = await fetch(url.replace('/api/explain', '/server.js'));
  assert.equal(backendFile.status, 404);

  const valid = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)});
  const result = await valid.json();
  assert.equal(valid.status, 200);
  assert.equal(result.source, 'deterministic');

  const invalid = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...input, config: {}})});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {error: 'invalid_simulation_state'});
});

test('HTTP endpoint forwards only the validated simulation summary to the provider', async t => {
  let sentInput;
  const server = createServer({
    env: {LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'backend-only'},
    fetchImpl: async (_url, options) => {
      sentInput = JSON.parse(options.body).input;
      return {ok: true, json: async () => ({output_text: 'Resumo do cenário.'})};
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/explain`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({...input, privateNote: 'must not reach the provider'}),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(sentInput), input);
  assert.doesNotMatch(sentInput, /must not reach the provider|backend-only/);
});

test('HTTP endpoint selects Hugging Face through server-only environment configuration', async t => {
  let request;
  const server = createServer({
    env: {LLM_PROVIDER: 'huggingface', HF_TOKEN: 'hf-server-secret'},
    fetchImpl: async (url, options) => {
      request = {url, options};
      return {ok: true, json: async () => ({choices: [{message: {content: 'Resumo observado.'}}]})};
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/explain`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(input),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(request.url, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer hf-server-secret');
  assert.equal(JSON.parse(request.options.body).model, 'openai/gpt-oss-120b:cheapest');
  assert.equal(result.source, 'llm');
  assert.doesNotMatch(JSON.stringify(result), /hf-server-secret/);
});

test('an API key alone does not enable remote explanations', async t => {
  let providerCalled = false;
  const server = createServer({
    env: {OPENAI_API_KEY: 'present-but-not-opted-in'},
    fetchImpl: async () => {
      providerCalled = true;
      throw new Error('provider must not be called');
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/explain`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(input),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.source, 'deterministic');
  assert.equal(providerCalled, false);
});
