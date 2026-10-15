/** Release only the WASM allocations and ArrayBuffer views owned by this harness. */
export function cleanupMemoryBenchmarkResources({wasm = null, views = []} = {}) {
  const buffers = new Set();
  for (const view of views) {
    const buffer = ArrayBuffer.isView(view) ? view.buffer : view;
    if (buffer instanceof ArrayBuffer && buffer.byteLength > 0) buffers.add(buffer);
  }

  let wasmDisposed = false;
  try {
    if (wasm && typeof wasm.dispose === 'function') {
      wasm.dispose();
      wasmDisposed = true;
    }
  } finally {
    if (buffers.size && typeof structuredClone === 'function') {
      structuredClone(null, {transfer: [...buffers]});
    }
  }

  return {wasmDisposed, detachedArrayBuffers: buffers.size};
}
