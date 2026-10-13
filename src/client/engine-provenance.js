export const ENGINE_SOURCE_FILES = Object.freeze([
  'engine.js',
  'animal-view-state.js',
  'feeding-model.js',
  'environment-model.js',
  'metabolism-wasm.js',
]);

export function bundleEngineSources(sources) {
  const encoder = new TextEncoder();
  const chunks = [];
  let totalLength = 0;

  for (const filename of ENGINE_SOURCE_FILES) {
    const source = sources instanceof Map ? sources.get(filename) : sources?.[filename];
    if (source === undefined) throw new Error(`Missing engine source: ${filename}`);
    const text = typeof source === 'string' ? source : new TextDecoder().decode(source);
    const normalizedSource = encoder.encode(text.replace(/\r\n?/g, '\n'));
    const header = encoder.encode(`${filename}\0${normalizedSource.byteLength}\0`);
    const separator = new Uint8Array([0]);
    chunks.push(header, normalizedSource, separator);
    totalLength += header.byteLength + normalizedSource.byteLength + separator.byteLength;
  }

  const bundle = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bundle.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bundle;
}
