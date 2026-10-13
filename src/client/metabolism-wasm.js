const INPUT_WIDTH = 4;
const OUTPUT_WIDTH = 2;
export const METABOLISM_MAINTENANCE_KG_DM = 5.3;
export const METABOLISM_GAIN_FACTOR = 0.22;

export function updateMetabolismJS(input, count = input.length / INPUT_WIDTH, output) {
  if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new RangeError('invalid metabolism animal count');
  if (input.length < count * INPUT_WIDTH) throw new RangeError('metabolism input buffer is too small');
  output ??= new Float64Array(count * OUTPUT_WIDTH);
  if (output.length < count * OUTPUT_WIDTH) throw new RangeError('metabolism output buffer is too small');
  for (let index = 0; index < count; index++) {
    const offset = index * INPUT_WIDTH;
    const weight = input[offset], energy = input[offset + 1], intake = input[offset + 2];
    const resting = input[offset + 3] !== 0;
    const gain = (intake - METABOLISM_MAINTENANCE_KG_DM * (weight / 360) / 24) * METABOLISM_GAIN_FACTOR;
    output[index * 2] = Math.max(200, weight + gain);
    output[index * 2 + 1] = Math.max(0, Math.min(100,
      energy + (resting ? 5 : intake * 4 - 1.5)));
  }
  return output;
}

export async function loadWasmMetabolism(url = new URL('../../wasm/riose_core.wasm', import.meta.url), fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`);
  const {instance} = await WebAssembly.instantiateStreaming(response, {});
  const {memory, riose_abi_version: abiVersion, riose_alloc_f64: allocate, riose_free_f64: release,
    riose_update_metabolism_batch: update} = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof abiVersion !== 'function'
    || abiVersion() !== 1 || typeof allocate !== 'function'
    || typeof release !== 'function' || typeof update !== 'function') {
    throw new Error('WASM exports do not match riose-core ABI');
  }

  let capacity = 0;
  let inputPointer = 0;
  let outputPointer = 0;
  const kernel = (values, count = values.length / INPUT_WIDTH, output) => {
    if (!Number.isInteger(count) || count < 0 || count > 100_000) throw new RangeError('invalid metabolism animal count');
    if (values.length < count * INPUT_WIDTH) throw new RangeError('metabolism input buffer is too small');
    output ??= new Float64Array(count * OUTPUT_WIDTH);
    if (output.length < count * OUTPUT_WIDTH) throw new RangeError('metabolism output buffer is too small');
    if (count === 0) return output.subarray(0,0);
    if (count > capacity) {
      const nextCapacity = Math.min(100_000, 2 ** Math.ceil(Math.log2(count)));
      let nextInputPointer = 0;
      let nextOutputPointer = 0;
      try {
        nextInputPointer = allocate(nextCapacity * INPUT_WIDTH);
        if (nextInputPointer) nextOutputPointer = allocate(nextCapacity * OUTPUT_WIDTH);
      } catch (cause) {
        if (nextInputPointer) release(nextInputPointer, nextCapacity * INPUT_WIDTH);
        throw new Error(`WASM could not allocate metabolism buffers for ${nextCapacity} animals`, {cause});
      }
      if (!nextInputPointer || !nextOutputPointer) {
        if (nextInputPointer) release(nextInputPointer, nextCapacity * INPUT_WIDTH);
        if (nextOutputPointer) release(nextOutputPointer, nextCapacity * OUTPUT_WIDTH);
        throw new Error(`WASM could not allocate metabolism buffers for ${nextCapacity} animals`);
      }
      if (capacity) {
        release(inputPointer, capacity * INPUT_WIDTH);
        release(outputPointer, capacity * OUTPUT_WIDTH);
      }
      capacity = nextCapacity;
      inputPointer = nextInputPointer;
      outputPointer = nextOutputPointer;
    }

    const input = new Float64Array(memory.buffer, inputPointer, count * INPUT_WIDTH);
    input.set(values.subarray(0, count * INPUT_WIDTH));
    const status = update(count, inputPointer, outputPointer);
    if (status !== 0) throw new Error(`WASM metabolism returned status ${status}`);
    output.set(new Float64Array(memory.buffer, outputPointer, count * OUTPUT_WIDTH),0);
    return output.subarray(0, count * OUTPUT_WIDTH);
  };

  kernel.dispose = () => {
    if (capacity) {
      release(inputPointer, capacity * INPUT_WIDTH);
      release(outputPointer, capacity * OUTPUT_WIDTH);
      capacity = 0;
    }
  };
  kernel.memoryBytes = () => memory.buffer.byteLength;
  return kernel;
}
