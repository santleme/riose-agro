const RNG_FIELDS = new Set(['seed', 'initialSeed', 'locomotionSeed']);
const LEGACY_VISUAL_FIELDS = new Set(['locomotionSeed', 'x', 'y', 'targetX', 'targetY']);

function pointerPart(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function childPointer(pointer, part) {
  return `${pointer}/${pointerPart(part)}`;
}

export function classifyTrajectoryDivergence(pointer, jsValue, rustValue) {
  const parts = pointer.split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts.some(part => RNG_FIELDS.has(part))) return 'RNG_DIVERGENCE';
  if (parts.includes('events') || parts.includes('history')) return 'EVENT_DIVERGENCE';
  if (parts.includes('animals')) {
    const animalIndex = parts.indexOf('animals') + 1;
    if (parts[animalIndex] !== undefined && !/^\d+$/.test(parts[animalIndex])) return 'ORDER_DIVERGENCE';
    if (['id', 'name'].includes(parts.at(-1))) return 'ORDER_DIVERGENCE';
    if (typeof jsValue === 'number' && typeof rustValue === 'number') return 'NUMERIC_DIVERGENCE';
    return 'STATE_DIVERGENCE';
  }
  if (parts.includes('metrics') || parts.includes('rows')) return 'NUMERIC_DIVERGENCE';
  if (parts.includes('snapshot') || parts.includes('snapshots')) return 'SNAPSHOT_DIVERGENCE';
  if (typeof jsValue === 'number' && typeof rustValue === 'number') return 'NUMERIC_DIVERGENCE';
  return 'CONTRACT_DIVERGENCE';
}

/** Compare JSON values exactly, ignoring object key order and preserving array order. */
export function compareExactJson(jsValue, rustValue, {ignoreLegacyVisualFields = false} = {}) {
  let comparedFieldCount = 0;

  function firstMismatch(js, rust, pointer = '') {
    comparedFieldCount += 1;
    if (typeof js !== typeof rust || js === null || rust === null) {
      if (js === rust) return null;
      return {pointer: pointer || '/', jsValue: js, rustValue: rust};
    }
    if (typeof js === 'number') {
      if (js === rust) return null;
      return {pointer: pointer || '/', jsValue: js, rustValue: rust};
    }
    if (typeof js !== 'object') {
      if (js === rust) return null;
      return {pointer: pointer || '/', jsValue: js, rustValue: rust};
    }
    if (Array.isArray(js) !== Array.isArray(rust)) {
      return {pointer: pointer || '/', jsValue: js, rustValue: rust};
    }
    if (Array.isArray(js)) {
      if (js.length !== rust.length) {
        return {pointer: childPointer(pointer, 'length'), jsValue: js.length, rustValue: rust.length};
      }
      for (let index = 0; index < js.length; index += 1) {
        const mismatch = firstMismatch(js[index], rust[index], childPointer(pointer, index));
        if (mismatch) return mismatch;
      }
      return null;
    }
    const keys = object => Object.keys(object)
      .filter(key => !ignoreLegacyVisualFields || !LEGACY_VISUAL_FIELDS.has(key))
      .sort();
    const jsKeys = keys(js);
    const rustKeys = keys(rust);
    const extraJs = jsKeys.find(key => !Object.hasOwn(rust, key));
    const extraRust = rustKeys.find(key => !Object.hasOwn(js, key));
    if (extraJs !== undefined || extraRust !== undefined) {
      const key = extraJs ?? extraRust;
      return {
        pointer: childPointer(pointer, key),
        jsValue: extraJs === undefined ? undefined : js[key],
        rustValue: extraRust === undefined ? undefined : rust[key],
      };
    }
    for (const jsKey of jsKeys) {
      const mismatch = firstMismatch(js[jsKey], rust[jsKey], childPointer(pointer, jsKey));
      if (mismatch) return mismatch;
    }
    return null;
  }

  const mismatch = firstMismatch(jsValue, rustValue);
  return {comparedFieldCount, mismatch};
}

export function compareTrajectoryCheckpoint({scenario, seed, checkpoint, previousMatchingCheckpoint, jsValue, rustValue}) {
  const {comparedFieldCount, mismatch} = compareExactJson(jsValue, rustValue, {ignoreLegacyVisualFields: true});
  if (!mismatch) return {parity: 'PASS', comparedFieldCount, firstDivergence: null};
  return {
    parity: 'FAIL',
    comparedFieldCount,
    firstDivergence: {
      scenario,
      seed,
      checkpoint,
      path: mismatch.pointer,
      jsValue: mismatch.jsValue,
      rustValue: mismatch.rustValue,
      previousMatchingCheckpoint: previousMatchingCheckpoint ?? null,
      divergenceClass: classifyTrajectoryDivergence(mismatch.pointer, mismatch.jsValue, mismatch.rustValue),
    },
  };
}

export function canonicalTrajectoryJson(value) {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  }
  return `${JSON.stringify(canonical(value))}\n`;
}
