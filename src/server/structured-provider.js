const PROVIDERS = {
  groq: {url: 'https://api.groq.com/openai/v1/chat/completions', tokenField: 'max_completion_tokens'},
  huggingface: {url: 'https://router.huggingface.co/v1/chat/completions', tokenField: 'max_tokens'},
  radeon: {url: 'https://developer.amd.com.cn/radeon/api/v1/chat/completions', tokenField: 'max_tokens'},
};
const MAX_RESPONSE_BYTES = 64 * 1024;

async function readProviderJson(response) {
  if (!response.body?.getReader) {
    const payload = await response.json();
    if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_RESPONSE_BYTES) throw new StructuredProviderError('provider_response_too_large', null);
    return payload;
  }
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new StructuredProviderError('provider_response_too_large', null);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new StructuredProviderError('provider_invalid_json', null); }
}

export class StructuredProviderError extends Error {
  constructor(reason, metadata) {
    super(reason);
    this.reason = reason;
    this.metadata = metadata;
  }
}

/** One bounded request, no retries. Only sanitized operational metadata leaves this module. */
export async function requestStructuredOutput({provider, apiKey, model, instructions, input, schema, name,
  maxTokens = 700, timeoutMs = 12000, fetchImpl = fetch}) {
  const settings = PROVIDERS[provider];
  if (!settings || !apiKey || !model) return null;
  const started = performance.now();
  let httpStatus = null;
  const metadata = () => ({latencyMs: Math.round(performance.now() - started), httpStatus});
  try {
    const response = await fetchImpl(settings.url, {
      method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({model, messages: [{role: 'system', content: instructions}, {role: 'user', content: JSON.stringify(input)}],
        [settings.tokenField]: maxTokens, temperature: 0, stream: false,
        ...(provider === 'groq' && /gpt-oss/.test(model) ? {reasoning_effort: 'low'} : {}),
        ...(provider === 'radeon' ? {reasoning_effort: 'none'} : {}),
        response_format: provider === 'radeon' && !/^MiMo-V2\.6-Flash$/i.test(model)
          ? {type: 'json_object'}
          : {type: 'json_schema', json_schema: {name, strict: true, schema}}}),
    });
    httpStatus = response.status ?? (response.ok ? 200 : null);
    if (!response.ok) {
      let providerErrorCode = null;
      let schemaFailures = [];
      try {
        const payload = await readProviderJson(response);
        if (['json_validate_failed', 'invalid_request_error', 'model_not_found', 'rate_limit_exceeded', 'insufficient_quota', 'invalid_api_key', 'context_length_exceeded', 'model_decommissioned'].includes(payload?.error?.code)) providerErrorCode = payload.error.code;
        if (providerErrorCode === 'json_validate_failed' && typeof payload.error.failed_generation === 'string') {
          try {
            const validate = new Ajv2020({strict: true, allErrors: true}).compile(schema);
            validate(JSON.parse(payload.error.failed_generation));
            schemaFailures = (validate.errors ?? []).slice(0, 4).map(({schemaPath, keyword}) => ({schemaPath, keyword}));
          } catch { schemaFailures = [{keyword: 'invalid_json', schemaPath: '#'}]; }
        }
      } catch { /* Never surface raw remote bodies or headers. */ }
      const reason = ({400: 'provider_schema_or_request', 401: 'provider_authentication', 403: 'provider_permission',
        404: 'provider_model_unavailable', 429: 'provider_rate_or_quota'})[httpStatus] ?? 'provider_unavailable';
      throw new StructuredProviderError(reason, {...metadata(), providerErrorCode, schemaFailures});
    }
    const payload = await readProviderJson(response);
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new StructuredProviderError('provider_incomplete_output', metadata());
    const content = choice?.message?.content;
    const text = typeof content === 'string' ? content : '';
    if (!text || text.length > 16000) throw new StructuredProviderError('provider_invalid_output', metadata());
    let value;
    try { value = JSON.parse(text); } catch { throw new StructuredProviderError('provider_invalid_json', metadata()); }
    const usage = {};
    for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
      const count = payload?.usage?.[key];
      if (Number.isSafeInteger(count) && count >= 0) usage[key] = count;
    }
    return {value, metadata: {...metadata(), usage}, provider, model};
  } catch (error) {
    if (error instanceof StructuredProviderError) {
      error.metadata ??= metadata();
      throw error;
    }
    throw new StructuredProviderError(['AbortError', 'TimeoutError'].includes(error?.name) ? 'provider_timeout' : 'provider_network_or_response', metadata());
  }
}
import Ajv2020 from 'ajv/dist/2020.js';

