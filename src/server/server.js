import {createServer as createHttpServer} from 'node:http';
import {readFileSync, readdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {validateFarmSnapshot} from '../client/snapshot-validator.js';
import {validateFarmSnapshotManifestReference} from '../client/snapshot-manifest-link.js';
import {executeNativeConfiguredComparison, nativeComparisonAvailable, nativeComparisonRunner} from './native-comparison.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MAX_BODY_BYTES = 16 * 1024;
const MAX_SNAPSHOT_BODY_BYTES = 4 * 1024 * 1024;
const MAX_NATIVE_COMPARISON_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 1200;
const MAX_OUTPUT_TOKENS = 160;
const PUBLIC_FILES = new Set([
  'tools/product-composer.html', 'tools/product-composer.css', 'tools/product-composer.js',
  'home.html', 'home.js', 'header-interaction.js', 'manifesto.html', 'manifesto.css', 'manifesto.js',
  'product.html', 'product.css', 'product-interaction.js', 'simulator.html', 'riose-mark.svg',
  'assets/riose-cow-cutout.png', 'assets/agroville-farm-worlds.png',
  'assets/research-pages/README.md', 'assets/research-pages/generative-agents-1.webp',
  'assets/research-pages/generative-agents-2.webp', 'assets/research-pages/generative-agents-3.webp',
  'assets/research-pages/grounded-agents-1.webp', 'assets/research-pages/grounded-agents-2.webp', 'assets/research-pages/grounded-agents-3.webp',
  'assets/research-pages/social-simulacra-1.webp', 'assets/research-pages/social-simulacra-2.webp', 'assets/research-pages/social-simulacra-3.webp',
  'index.html', 'lab.html', 'style.css', 'app.js', 'engine.js', 'animal-view-state.js', 'engine-provenance.js', 'environment-model.js', 'feeding-model.js', 'simulation-report.js', 'run-history.js', 'worker.js', 'favicon.svg',
  'environment-inputs.js', 'lot-metrics.js', 'thermal-index.js', 'lot-selection.js', 'scientific/br_corte_pasture_dmi.js',
  'snapshot-review.js', 'snapshot-review.css', 'snapshot-validator.js', 'outcome-review.html', 'outcome-review.css', 'outcome-review.js',
  'adult-data.html', 'adult-data.css', 'adult-data.js', 'adult-data-model.js',
  'adult-cow-data.html', 'adult-cow-data.css', 'adult-cow-data.js', 'adult-cow-data-model.js',
  'montana-cow-data.html', 'montana-cow-data.js',
  'rangeland-behavior.html', 'rangeland-behavior.js',
  'data/perea-rangeland-behavior/cattle_behavior_data_time_V2.csv',
  'docs/evidence/perea-rangeland-behavior-audit.json',
  'usda-cgrec-cow-calf.html', 'usda-cgrec-cow-calf.css', 'usda-cgrec-cow-calf.js',
  'observed-data.html', 'observed-data.css', 'observed-data.js', 'observed-data-model.js',
  'data/observed-calves-zenodo-7251167.json',
  'data/mdpi-angus-cow-grazing/weight-change-observations.json',
  'data/mdpi-angus-cow-grazing/supplement.zip',
  'docs/evidence/mdpi-angus-cow-grazing-audit.json',
  'docs/evidence/mdpi-angus-gps-adg-association.json',
  'rothamsted-data.html', 'rothamsted-data.css', 'rothamsted-data.js',
  'cgrec-data.html', 'cgrec-data.js', 'hpgrs-data.html', 'hpgrs-data.js',
  'grasscast-data.html', 'grasscast-data.js', 'grasscast-data.css',
  'data/usda-cper/period.csv', 'data/usda-cper/daily.csv',
  'docs/evidence/usda-cper-association.json',
  'docs/evidence/usda-grasscast-cper-association.json',
  'docs/evidence/zenodo-grazing-allometry-association.json',
  'docs/evidence/engine-adg-usda-cper-ltgi-check.json',
  'docs/evidence/engine-adg-usda-cgrec-transport-check.json',
  'docs/evidence/engine-adg-zenodo-cows-check.json',
  'docs/evidence/usda-cgrec-cow-calf-audit.json',
  'data/usda-cgrec-longterm/Streeter-ND_1989-2015_compiled.csv', 'data/usda-cgrec-longterm/manifest.json',
  'data/usda-cgrec-cow-calf/cow-calf-observations.json', 'data/usda-cgrec-cow-calf/manifest.json',
  'data/usda-cgrec-cow-calf/CentralGrasslandsFireForageNAL.xlsx',
  'data/usda-grasscast/manifest.json', 'data/usda-grasscast/cper-grouped-observations.json',
  'data/usda-hpgrs-1982-2022/EastUnit_LTGI.csv', 'data/usda-hpgrs-1982-2022/EastUnit_LTGI_DataDictionary.csv', 'data/usda-hpgrs-1982-2022/manifest.json',
  'data/zenodo-grazing-allometry/Zenodo_Data_Allometry.txt', 'data/zenodo-grazing-allometry/manifest.json',
  'data/rothamsted/Cattle_LWt_collated_2018-2025.csv', 'data/rothamsted/2018-2025_Pasture_DM_herbage_mass.csv',
  'schemas/farm-snapshot.schema.json', 'schemas/outcome-record.schema.json',
]);
const CLIENT_FILES = new Set(readdirSync(resolve(ROOT, 'src/client')));

for (const file of [
  'scenario-storage.js', 'metabolism-wasm.js', 'wasm/riose_core.wasm', 'schemas/visual-scene.schema.json',
  'graphics-poc/index.html', 'graphics-poc/style.css', 'graphics-poc/dist/app.js', 'graphics-poc/scene.json', 'graphics-poc/scenes/dairy.json', 'graphics-poc/scenes/water-stress-visual.json', 'graphics-poc/scenes/terrain-v8.json', 'graphics-poc/scenes/farm-assembly-v8.json', 'graphics-poc/scenes/farm-final-v8.json',
  'graphics-poc/ranch-v4.html', 'graphics-poc/ranch-v4.css', 'graphics-poc/dist/ranch-v4.js',
  'graphics-poc/ranch-v6.html', 'graphics-poc/ranch-v6.css', 'graphics-poc/dist/ranch-v6.js',
  'graphics-poc/spatial-debug.html', 'graphics-poc/spatial-debug.css', 'graphics-poc/dist/spatial-debug.js',
  'graphics-poc/asset-geometry-annotator.html', 'graphics-poc/asset-geometry-annotator.css', 'graphics-poc/asset-geometry-annotator.js',
  'graphics-poc/asset-registry.json', 'graphics-poc/asset-geometry-v1.json', 'graphics-poc/assembly-specs-v6.js', 'graphics-poc/spatial-assembly-v6.js', 'graphics-poc/contract.js',
  'graphics-poc/asset-spatial-annotations-v1.json',
  'graphics-poc/generated/ranch-v4.tmj', 'graphics-poc/generated/terrain-v5/homestead-high-ground.png',
  'graphics-poc/generated/terrain-v5/homestead-high-ground-render.png',
  'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png', 'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.json',
  'artifacts/graphics/spatial-assembly-v6/compiled-beef-84018.json',
  'artifacts/graphics/spatial-assembly-v6/compiled-beef-84019.json',
  'artifacts/graphics/spatial-assembly-v6/compiled-beef-84020.json',
  'artifacts/graphics/spatial-assembly-v6/compiled-dairy-84018.json',
  'graphics-poc/asset-sources.json', 'graphics-poc/assets/farm-starter-atlas.png', 'graphics-poc/assets/nelore-adult-idle-v1.png',
  'graphics-poc/assets/handling-review-atlas-v1.png', 'graphics-poc/assets/dairy/dairy-holstein-cow.png',
  'graphics-poc/assets/dairy/dairy-girolando-cow.png', 'graphics-poc/assets/dairy/dairy-heifer.png',
  'graphics-poc/assets/dairy/dairy-heifer-calf.png', 'graphics-poc/assets/dairy/dairy-barn.png',
  'graphics-poc/assets/dairy/dairy-milking-parlor.png', 'graphics-poc/assets/dairy/dairy-milk-chilling-tank.png',
  'graphics-poc/assets/dairy/dairy-waiting-pen.png', 'graphics-poc/assets/dairy/dairy-activity-collar.png',
  'graphics-poc/assets/main-composer-render-manifest.json', 'graphics-poc/assets/main-composer/environment-review-atlas-v1.png',
  'graphics-poc/assets/main-composer/infrastructure-review-atlas-v1.png', 'graphics-poc/assets/main-composer/technology-review-atlas-v1.png',
  'graphics-poc/assets/main-composer/animals-review-atlas-v1.png', 'graphics-poc/assets/main-composer/dairy-assets-atlas-v1.png',
]) PUBLIC_FILES.add(file);
const spatialRegistryPath = 'graphics-poc/asset-registry.json';
const spatialRegistry = JSON.parse(readFileSync(resolve(ROOT, spatialRegistryPath), 'utf8'));
for (const asset of spatialRegistry.assets) {
  const sourceFile = asset.source?.file;
  if (typeof sourceFile === 'string' && sourceFile.startsWith('assets/')) PUBLIC_FILES.add(sourceFile);
}
// The V4 scene is authored from the repository asset catalog. Publish only its
// exact inputs instead of exposing the whole top-level assets/ directory.
const GRAPHICS_SCENE_FILE = 'assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json';
const GRAPHICS_MANIFEST_FILE = 'assets/manifests/manifest.json';
const graphicsScene = JSON.parse(readFileSync(resolve(ROOT, GRAPHICS_SCENE_FILE), 'utf8'));
const graphicsManifest = JSON.parse(readFileSync(resolve(ROOT, GRAPHICS_MANIFEST_FILE), 'utf8'));
const graphicsAssetIds = new Set([graphicsScene.terrainAssetId,
  ...graphicsScene.placements.map(placement => placement.assetId),
  ...graphicsScene.groundingOverlays.map(overlay => overlay.assetId),
]);
const graphicsRecords = new Map(graphicsManifest.assets.map(asset => [asset.id, asset]));
const GRAPHICS_SOURCE_FILES = new Set([GRAPHICS_SCENE_FILE, GRAPHICS_MANIFEST_FILE,
  'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png',
  'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.json',
  'assets/generated/world-v8/terrain-atlas-v8.png', 'assets/generated/world-v8/terrain-atlas-v8.json',
]);
for (const assetId of graphicsAssetIds) {
  const asset = graphicsRecords.get(assetId);
  if (!asset?.file || !asset.file.startsWith('assets/')) throw new Error(`Missing or unsafe V4 runtime asset: ${assetId}`);
  GRAPHICS_SOURCE_FILES.add(asset.file);
}
for (const file of GRAPHICS_SOURCE_FILES) PUBLIC_FILES.add(file);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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
  const chatContent = payload?.choices?.[0]?.message?.content;
  if (typeof chatContent === 'string') return chatContent.trim();
  if (Array.isArray(chatContent)) return chatContent.map(item => typeof item?.text === 'string' ? item.text : '').join('').trim();
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
  const providerConfig = {
    openai: {url: 'https://api.openai.com/v1/responses', protocol: 'responses'},
    groq: {url: 'https://api.groq.com/openai/v1/chat/completions', protocol: 'chat', tokenLimitField: 'max_completion_tokens'},
    huggingface: {url: 'https://router.huggingface.co/v1/chat/completions', protocol: 'chat', tokenLimitField: 'max_tokens'},
  }[provider];
  if (!providerConfig || !apiKey) {
    return {text: fallback, source: 'deterministic', label: 'Explicação determinística · não medido'};
  }

  try {
    const instructions = 'Explique em português brasileiro, em até duas frases, apenas o estado e os valores fornecidos por esta simulação. Não invente causas, previsões ou medições. Não recomende manejo real. Sua resposta é uma explicação textual não medida; não proponha nem execute ações.';
    const body = providerConfig.protocol === 'responses'
      ? {model, store: false, max_output_tokens: MAX_OUTPUT_TOKENS, instructions, input: JSON.stringify(input)}
      : {
        model,
        messages: [{role: 'system', content: instructions}, {role: 'user', content: JSON.stringify(input)}],
        [providerConfig.tokenLimitField]: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        stream: false,
      };
    const result = await fetchImpl(providerConfig.url, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(body),
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
  return readJsonWithLimit(request, MAX_BODY_BYTES);
}

async function readJsonWithLimit(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('body_too_large'), {status: 413});
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid_json'), {status: 400});
  }
}

const schemaPath = resolve(ROOT, 'schemas/farm-snapshot.schema.json');
const snapshotSchema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({allErrors: true, strict: true, strictRequired: false});
addFormats(ajv);
const validateSnapshotSchema = ajv.compile(snapshotSchema);
const configuredComparisonSchema = JSON.parse(readFileSync(resolve(ROOT, 'schemas/configured-comparison-request-v2.schema.json'), 'utf8'));
const validateConfiguredComparisonRequest = new Ajv2020({allErrors: true, strict: false, strictRequired: false}).compile(configuredComparisonSchema);

export function validateSnapshotReviewRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot)) {
    return {status: 400, body: {error: 'invalid_snapshot_request'}};
  }
  const snapshot = input.snapshot;
  const schemaValid = validateSnapshotSchema(snapshot);
  const semantic = validateFarmSnapshot(snapshot);
  const countsByStatus = {};
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.path === 'string' && typeof value.status === 'string' && typeof value.sourceId === 'string') {
      countsByStatus[value.status] = (countsByStatus[value.status] ?? 0) + 1;
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(snapshot);
  const errors = [
    ...(schemaValid ? [] : validateSnapshotSchema.errors.map(error => `${error.instancePath || '/'} ${error.message}`)),
    ...semantic.errors,
  ];
  let manifestReferenceChecked = false;
  let manifestReferenceValid = snapshot.manifestReference?.status !== 'linked';
  if (snapshot.manifestReference?.status === 'linked') {
    manifestReferenceValid = false;
    if (typeof input.manifestBase64 !== 'string' || !input.manifestBase64) {
      errors.push('Snapshot ligado a manifesto; selecione o arquivo exato para conferir SHA-256 e versão.');
    } else if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.manifestBase64)) {
      manifestReferenceChecked = true;
      errors.push('Conteúdo do manifesto em base64 inválido.');
    } else {
      manifestReferenceChecked = true;
      try {
        const manifestBytes = Buffer.from(input.manifestBase64, 'base64');
        if (manifestBytes.toString('base64') !== input.manifestBase64) throw new Error('invalid_base64');
        const manifestCheck = validateFarmSnapshotManifestReference(snapshot, manifestBytes);
        errors.push(...manifestCheck.errors);
        manifestReferenceValid = manifestCheck.valid;
      } catch {
        errors.push('Não foi possível ler ou validar o arquivo de manifesto selecionado.');
      }
    }
  } else if (input.manifestBase64 !== undefined) {
    manifestReferenceValid = false;
    errors.push('Foi selecionado um manifesto, mas o snapshot declara manifestReference.status=not-linked.');
  }
  const valid = schemaValid && semantic.semanticValid && manifestReferenceValid && errors.length === 0;
  return {status: 200, body: {
    snapshotId: snapshot.snapshotId ?? null,
    snapshotKind: snapshot.snapshotKind ?? null,
    eligibilityStatus: snapshot.simulationEligibility?.status ?? null,
    coverage: {
      sourceCount: Array.isArray(snapshot.sourceCatalog) ? snapshot.sourceCatalog.length : 0,
      lotCount: Array.isArray(snapshot.lots) ? snapshot.lots.length : 0,
      animalCount: Array.isArray(snapshot.animals) ? snapshot.animals.length : 0,
      paddockCount: Array.isArray(snapshot.paddocks) ? snapshot.paddocks.length : 0,
      observationCount: Array.isArray(snapshot.observations) ? snapshot.observations.length : 0,
      operationEventCount: Array.isArray(snapshot.operations?.events) ? snapshot.operations.events.length : 0,
      historyEventCount: Array.isArray(snapshot.history?.events) ? snapshot.history.events.length : 0,
      evidenceFieldsByStatus: countsByStatus,
      sources: (Array.isArray(snapshot.sourceCatalog) ? snapshot.sourceCatalog : []).map(source => ({
        id: source?.id ?? null,
        title: source?.title ?? null,
        version: source?.version ?? null,
        license: source?.license ?? null,
        url: source?.url ?? null,
      })),
    },
    schemaValid,
    semanticValid: semantic.semanticValid,
    manifestReferenceChecked,
    manifestReferenceValid,
    valid,
    simulationEligible: valid && semantic.simulationEligible,
    errors,
    blockers: semantic.blockers,
    missingRequiredFields: semantic.missingRequiredFields,
  }};
}

function sendJson(response, status, value) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(JSON.stringify(value));
}

async function serveStatic(pathname, response, env = process.env) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(response, 400, {error: 'invalid_path'}); }
  const relative = decoded === '/' ? 'home.html' : decoded.replace(/^\/+/, '');
  if (relative.startsWith('tools/') && env.NODE_ENV === 'production') return sendJson(response, 404, {error: 'not_found'});
  const isProjectAsset = relative.startsWith('assets/') && !PUBLIC_FILES.has(relative) && !relative.split('/').some(part => part === '.' || part === '..');
  const isGraphicsSourceAsset = GRAPHICS_SOURCE_FILES.has(relative);
  const isClientFile = relative.startsWith('src/client/') && CLIENT_FILES.has(relative.slice('src/client/'.length));
  const isLegacyClientFile = CLIENT_FILES.has(relative) && PUBLIC_FILES.has(relative);
  if (!PUBLIC_FILES.has(relative) && !isProjectAsset && !isGraphicsSourceAsset && !isClientFile) return sendJson(response, 404, {error: 'not_found'});
  const path = isGraphicsSourceAsset ? resolve(ROOT, relative)
    : isProjectAsset ? resolve(ROOT, 'public', relative)
    : isLegacyClientFile ? resolve(ROOT, 'src/client', relative)
      : resolve(ROOT, relative);
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

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function createServer({env = process.env, fetchImpl = fetch} = {}) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/native/configured-comparison') {
      if (request.method === 'GET') {
        const runner = nativeComparisonRunner(env, ROOT);
        const available = isLoopbackRequest(request) && await nativeComparisonAvailable(runner);
        return sendJson(response, 200, {available, backend: available ? 'local-rust' : 'local-js'});
      }
      if (request.method === 'POST') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, {error: 'native_runner_requires_loopback'});
        const runner = nativeComparisonRunner(env, ROOT);
        if (!await nativeComparisonAvailable(runner)) return sendJson(response, 503, {error: 'native_runner_unavailable'});
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
          return sendJson(response, 415, {error: 'content_type_must_be_json'});
        }
        try {
          const input = await readJsonWithLimit(request, MAX_NATIVE_COMPARISON_BODY_BYTES);
          if (!validateConfiguredComparisonRequest(input)) return sendJson(response, 400, {error: 'invalid_configured_comparison_request'});
          const native = await executeNativeConfiguredComparison(input, runner);
          return sendJson(response, 200, {
            comparison: native.comparison,
            engine: native.engine,
            runId: native.runId,
            inputSha256: native.inputSha256,
          });
        } catch (error) {
          return sendJson(response, error.status ?? 502, {error: error.status === 413 ? 'request_too_large' : 'native_comparison_failed'});
        }
      }
      response.setHeader('allow', 'GET, POST');
      return sendJson(response, 405, {error: 'method_not_allowed'});
    }
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
        const providerSettings = {
          openai: {apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL ?? 'gpt-6-luna'},
          groq: {apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL ?? 'openai/gpt-oss-20b'},
          huggingface: {apiKey: env.HF_TOKEN, model: env.HF_MODEL ?? 'openai/gpt-oss-120b:cheapest'},
        }[provider] ?? {};
        const result = await explain(safeInput, {provider, apiKey: providerSettings.apiKey, model: env.LLM_MODEL ?? providerSettings.model, fetchImpl});
        return sendJson(response, 200, result);
      } catch (error) {
        return sendJson(response, error.status ?? 400, {error: error.status === 413 ? 'request_too_large' : 'invalid_request'});
      }
    }
    if (url.pathname === '/api/validate-snapshot' && request.method === 'POST') {
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        return sendJson(response, 415, {error: 'content_type_must_be_json'});
      }
      try {
        const input = await readJsonWithLimit(request, MAX_SNAPSHOT_BODY_BYTES);
        const result = validateSnapshotReviewRequest(input);
        return sendJson(response, result.status, result.body);
      } catch (error) {
        return sendJson(response, error.status ?? 400, {error: error.status === 413 ? 'request_too_large' : 'invalid_request'});
      }
    }
    if (request.method === 'GET' || request.method === 'HEAD') return serveStatic(url.pathname, response, env);
    sendJson(response, 405, {error: 'method_not_allowed'});
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8000);
  const host = process.env.HOST ?? '127.0.0.1';
  const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);
  if (!loopbackHosts.has(host) && process.env.ALLOW_REMOTE_ACCESS !== 'true') {
    process.stderr.write('HOST fora do loopback pode expor snapshots locais. Defina ALLOW_REMOTE_ACCESS=true para confirmar explicitamente.\n');
    process.exitCode = 1;
  } else {
    if (!loopbackHosts.has(host)) process.stderr.write('Aviso: o servidor e a API de revisão de snapshots estão acessíveis pela rede.\n');
    createServer().listen(port, host, () => process.stdout.write(`Agroville disponível em http://${host}:${port}\n`));
  }
}
