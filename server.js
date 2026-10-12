import {createServer as createHttpServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 1200;
const MAX_OUTPUT_TOKENS = 160;
const PUBLIC_FILES = new Set(['index.html', 'style.css', 'app.js', 'engine.js', 'worker.js']);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const enumValue = (value, options) => options.includes(value);
const finiteInRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

export function validateExplanationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const {hour, config, metrics} = input;
  return Number.isInteger(hour) && hour >= 0 && hour <= 1_000_000
    && config && typeof config === 'object' && !Array.isArray(config)
    && enumValue(config.diet, ['pasture', 'balanced', 'concentrate'])
    && enumValue(config.housing, ['pasture', 'barn'])
    && enumValue(config.weather, ['normal', 'hot', 'rain'])
    && finiteInRange(config.supplement, 0, 4)
    && metrics && typeof metrics === 'object' && !Array.isArray(metrics)
    && finiteInRange(metrics.weight, 0, 100_000)
    && finiteInRange(metrics.gain, -100_000, 100_000)
    && finiteInRange(metrics.cost, 0, 1_000_000_000)
    && finiteInRange(metrics.pasture, 0, 100_000_000)
    && finiteInRange(metrics.stress, 0, 100);
}

export function deterministicExplanation(input) {
  const {config, metrics, hour} = input;
  const housing = config.housing === 'barn' ? 'confinamento' : 'pasto';
  const weather = {normal: 'ameno', hot: 'quente', rain: 'chuvoso'}[config.weather];
  const diet = {pasture: 'volumoso/pasto', balanced: 'balanceada', concentrate: 'concentrada'}[config.diet];
  return `No dia ${Math.floor(hour / 24) + 1}, o cenário está em ${housing}, com dieta ${diet} e clima ${weather}. O motor estima peso médio de ${metrics.weight.toFixed(1)} kg e custo acumulado de R$ ${metrics.cost.toFixed(2)}. Estes valores vêm das regras demonstrativas da simulação; não são medições nem recomendações.`;
}

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  return (payload?.output ?? [])
    .flatMap(item => item.type === 'message' ? item.content ?? [] : [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('\n').trim();
}

export async function explain(input, {
  provider = 'none',
  apiKey = '',
  model = 'gpt-6-luna',
  fetchImpl = fetch,
} = {}) {
  const fallback = deterministicExplanation(input);
  if (provider !== 'openai' || !apiKey) {
    return {text: fallback, source: 'deterministic', label: 'Explicação determinística · não medido'};
  }

  try {
    const result = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        instructions: 'Explique em português brasileiro, em até duas frases, apenas o estado e os valores fornecidos por esta simulação. Não invente causas, previsões ou medições. Não recomende manejo real. Sua resposta é uma explicação textual não medida; não proponha nem execute ações.',
        input: JSON.stringify(input),
      }),
    });
    if (!result.ok) throw new Error('provider_error');
    const text = responseText(await result.json());
    if (!text || text.length > MAX_TEXT_LENGTH) throw new Error('invalid_provider_output');
    return {text, source: 'llm', label: 'Texto gerado por IA · não medido'};
  } catch {
    return {text: fallback, source: 'deterministic', label: 'Explicação determinística · não medido'};
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body_too_large'), {status: 413});
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid_json'), {status: 400});
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(JSON.stringify(value));
}

async function serveStatic(pathname, response) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(response, 400, {error: 'invalid_path'}); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const isProjectAsset = relative.startsWith('assets/') && !relative.split('/').some(part => part === '.' || part === '..');
  if (!PUBLIC_FILES.has(relative) && !isProjectAsset) return sendJson(response, 404, {error: 'not_found'});
  const path = isProjectAsset ? resolve(ROOT, 'public', relative) : resolve(ROOT, relative);
  const allowedRoot = isProjectAsset ? resolve(ROOT, 'public') : ROOT;
  if (path !== allowedRoot && !path.startsWith(allowedRoot + sep)) return sendJson(response, 404, {error: 'not_found'});
  try {
    const body = await readFile(path);
    response.writeHead(200, {'content-type': MIME_TYPES[extname(path)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff'});
    response.end(body);
  } catch {
    sendJson(response, 404, {error: 'not_found'});
  }
}

export function createServer({env = process.env, fetchImpl = fetch} = {}) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/explain' && request.method === 'POST') {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        return sendJson(response, 415, {error: 'content_type_must_be_json'});
      }
      try {
        const input = await readJson(request);
        if (!validateExplanationInput(input)) return sendJson(response, 400, {error: 'invalid_simulation_state'});
        const safeInput = {
          hour: input.hour,
          config: {diet: input.config.diet, housing: input.config.housing, weather: input.config.weather, supplement: input.config.supplement},
          metrics: {weight: input.metrics.weight, gain: input.metrics.gain, cost: input.metrics.cost, pasture: input.metrics.pasture, stress: input.metrics.stress},
        };
        const provider = env.LLM_PROVIDER ?? 'none';
        const result = await explain(safeInput, {provider, apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL ?? 'gpt-6-luna', fetchImpl});
        return sendJson(response, 200, result);
      } catch (error) {
        return sendJson(response, error.status ?? 400, {error: error.status === 413 ? 'request_too_large' : 'invalid_request'});
      }
    }
    if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(url.pathname, response);
    sendJson(response, 405, {error: 'method_not_allowed'});
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8000);
  const host = process.env.HOST ?? '127.0.0.1';
  createServer().listen(port, host, () => process.stdout.write(`Agroville disponível em http://${host}:${port}\n`));
}
