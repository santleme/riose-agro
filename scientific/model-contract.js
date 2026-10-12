const SUPPORTED_FIELD_TYPES = new Set(['array', 'boolean', 'integer', 'number', 'object', 'string']);

export const SCIENTIFIC_MODEL_INTERFACE_VERSION = 1;
const registeredModels = new Map();

function assertShape(shape, name) {
  if (!shape || typeof shape !== 'object' || Array.isArray(shape) || Object.keys(shape).length === 0) {
    throw new TypeError(`${name} must declare at least one field`);
  }
  for (const [field, type] of Object.entries(shape)) {
    if (!SUPPORTED_FIELD_TYPES.has(type)) {
      throw new TypeError(`${name}.${field} uses unsupported type "${type}"`);
    }
  }
}

function assertDataMatchesShape(value, shape, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  for (const [field, type] of Object.entries(shape)) {
    if (!Object.hasOwn(value, field)) {
      throw new TypeError(`${name}.${field} is required`);
    }
    const actual = value[field];
    const valid = type === 'number' ? Number.isFinite(actual)
      : type === 'integer' ? Number.isInteger(actual)
        : type === 'array' ? Array.isArray(actual)
          : type === 'object' ? actual !== null && typeof actual === 'object' && !Array.isArray(actual)
            : typeof actual === type;
    if (!valid) throw new TypeError(`${name}.${field} must be ${type}`);
  }
}

function cloneAndFreeze(value, ancestors = new Set()) {
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('Scientific model evidence cannot contain circular references');
  ancestors.add(value);
  const clone = Array.isArray(value)
    ? value.map(item => cloneAndFreeze(item, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAndFreeze(item, ancestors)]));
  ancestors.delete(value);
  return Object.freeze(clone);
}

export function defineScientificModel({id, version, inputs, outputs, units = {}, evidence, implementationSource, run} = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('Scientific model id must be a non-empty string');
  if (typeof version !== 'string' || !version.trim()) throw new TypeError(`Scientific model "${id}" version must be a non-empty string`);
  assertShape(inputs, `Scientific model "${id}" inputs`);
  assertShape(outputs, `Scientific model "${id}" outputs`);
  if (!units || typeof units !== 'object' || Array.isArray(units)) throw new TypeError(`Scientific model "${id}" units must be an object`);
  for (const [field, unit] of Object.entries(units)) {
    if ((!Object.hasOwn(inputs, field) && !Object.hasOwn(outputs, field)) || typeof unit !== 'string' || !unit.trim()) {
      throw new TypeError(`Scientific model "${id}" unit "${field}" must name a declared input/output and a non-empty unit`);
    }
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError(`Scientific model "${id}" evidence must be an object`);
  }
  if (typeof run !== 'function') throw new TypeError(`Scientific model "${id}" run must be a function`);
  if (implementationSource !== undefined && (typeof implementationSource !== 'string' || !implementationSource.trim())) {
    throw new TypeError(`Scientific model "${id}" implementationSource must be a non-empty string`);
  }

  return Object.freeze({
    interfaceVersion: SCIENTIFIC_MODEL_INTERFACE_VERSION,
    id,
    version,
    inputs: Object.freeze({...inputs}),
    outputs: Object.freeze({...outputs}),
    units: Object.freeze({...units}),
    evidence: cloneAndFreeze(evidence),
    implementationSource: implementationSource ?? run.toString(),
    run
  });
}

export function registerScientificModel(model) {
  if (!model || model.interfaceVersion !== SCIENTIFIC_MODEL_INTERFACE_VERSION) throw new TypeError('Cannot register an unsupported scientific model');
  const key = `${model.id}@${model.version}`;
  const existing = registeredModels.get(key);
  if (existing && existing !== model) throw new Error(`Scientific model version is already registered: ${key}`);
  registeredModels.set(key, model);
  return model;
}

export function resolveScientificModel(id, version) {
  if (typeof id !== 'string' || typeof version !== 'string') throw new TypeError('Scientific model ID and version are required');
  const model = registeredModels.get(`${id}@${version}`);
  if (!model) throw new Error(`Unknown scientific model version: ${id}@${version}`);
  return model;
}

// Synchronous SHA-256 keeps report creation deterministic in both Node and browser modules.
function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const words = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes[i] << (24 - (i % 4) * 8);
  words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | 0x80 << (24 - (bytes.length % 4) * 8);
  const bitLength = bytes.length * 8;
  words[((bytes.length + 8 >> 6) << 4) + 15] = bitLength;
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const r = (x,n) => x >>> n | x << (32-n);
  for (let offset=0; offset<words.length; offset+=16) {
    const w = new Array(64);
    for (let i=0;i<16;i++) w[i]=words[offset+i]||0;
    for (let i=16;i<64;i++) { const a=w[i-15],b=w[i-2],s0=r(a,7)^r(a,18)^(a>>>3),s1=r(b,17)^r(b,19)^(b>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)|0; }
    let [a,b,c,d,e,f,g,hh]=h;
    for (let i=0;i<64;i++) { const s1=r(e,6)^r(e,11)^r(e,25),ch=(e&f)^(~e&g),t1=(hh+s1+ch+k[i]+w[i])|0,s0=r(a,2)^r(a,13)^r(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)|0; hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0; }
    h=h.map((v,i)=>(v+[a,b,c,d,e,f,g,hh][i])|0);
  }
  return h.map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
}

export function runRegisteredScientificModel({id, version, inputs} = {}) {
  const model = resolveScientificModel(id, version);
  const result = runScientificModel(model, inputs);
  const references = [];
  const source = model.evidence.source;
  if (typeof source === 'string' && source.trim()) references.push({id: source, locator: source, status: model.evidence.status ?? 'demonstrative'});
  const provenance = {
      modelId: model.id,
      version: model.version,
      inputs: Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, {value, unit: model.units[name] ?? null}])),
      evidenceReferences: references,
      evidenceStatus: model.evidence.status ?? 'demonstrative',
      implementationHash: `sha256:${sha256(model.implementationSource)}`
  };
  return {...result, provenance, scientificProvenance: [provenance]};
}

export function runScientificModel(model, inputs) {
  if (!model || model.interfaceVersion !== SCIENTIFIC_MODEL_INTERFACE_VERSION) {
    throw new Error(`Unsupported scientific model interface version; expected ${SCIENTIFIC_MODEL_INTERFACE_VERSION}`);
  }
  if (typeof model.id !== 'string' || !model.id.trim()) throw new TypeError('Scientific model id must be a non-empty string');
  if (typeof model.version !== 'string' || !model.version.trim()) {
    throw new TypeError(`Scientific model "${model.id}" version must be a non-empty string`);
  }
  assertShape(model.inputs, `Scientific model "${model.id}" inputs`);
  assertShape(model.outputs, `Scientific model "${model.id}" outputs`);
  if (!model.evidence || typeof model.evidence !== 'object' || Array.isArray(model.evidence)) {
    throw new TypeError(`Scientific model "${model.id}" evidence must be an object`);
  }
  if (typeof model.run !== 'function') throw new TypeError(`Scientific model "${model.id}" run must be a function`);

  assertDataMatchesShape(inputs, model.inputs, `Scientific model "${model.id}" inputs`);
  const outputs = model.run(inputs);
  assertDataMatchesShape(outputs, model.outputs, `Scientific model "${model.id}" outputs`);
  return {modelId: model.id, version: model.version, outputs, evidence: model.evidence};
}
