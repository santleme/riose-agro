const INPUT_WIDTH = 4;
const OUTPUT_WIDTH = 2;
export const METABOLISM_MAINTENANCE_KG_DM = 5.3;
export const METABOLISM_GAIN_FACTOR = 0.22;

function validBufferRange(pointer, length, memory) {
  if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer % Float64Array.BYTES_PER_ELEMENT !== 0) return false;
  const byteLength = length * Float64Array.BYTES_PER_ELEMENT;
  const end = pointer + byteLength;
  return Number.isSafeInteger(end) && end <= memory.buffer.byteLength;
}

function aggregateFailure(message, errors) {
  return new Error(message, {cause: new AggregateError(errors, message)});
}

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
  let compatible = false;
  try {
    compatible = memory instanceof WebAssembly.Memory && typeof abiVersion === 'function'
      && abiVersion() === 1 && typeof allocate === 'function'
      && typeof release === 'function' && typeof update === 'function';
  } catch (cause) {
    throw new Error('WASM exports do not match riose-core ABI', {cause});
  }
  if (!compatible) {
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
        if (validBufferRange(nextInputPointer, nextCapacity * INPUT_WIDTH, memory)) {
          nextOutputPointer = allocate(nextCapacity * OUTPUT_WIDTH);
        }
      } catch (cause) {
        const cleanupErrors = [];
        if (validBufferRange(nextInputPointer, nextCapacity * INPUT_WIDTH, memory)) {
          try { release(nextInputPointer, nextCapacity * INPUT_WIDTH); }
          catch (error) { cleanupErrors.push(error); }
        }
        if (cleanupErrors.length) {
          throw aggregateFailure(`WASM could not allocate metabolism buffers for ${nextCapacity} animals`, [cause, ...cleanupErrors]);
        }
        throw new Error(`WASM could not allocate metabolism buffers for ${nextCapacity} animals`, {cause});
      }
      const inputRangeValid = validBufferRange(nextInputPointer, nextCapacity * INPUT_WIDTH, memory);
      const outputRangeValid = validBufferRange(nextOutputPointer, nextCapacity * OUTPUT_WIDTH, memory);
      const invalidReturnedPointer = (nextInputPointer !== 0 && !inputRangeValid)
        || (nextOutputPointer !== 0 && !outputRangeValid);
      if ((!nextInputPointer || !nextOutputPointer) && !invalidReturnedPointer) {
        const cleanupErrors = [];
        if (inputRangeValid) {
          try { release(nextInputPointer, nextCapacity * INPUT_WIDTH); }
          catch (error) { cleanupErrors.push(error); }
        }
        if (outputRangeValid) {
          try { release(nextOutputPointer, nextCapacity * OUTPUT_WIDTH); }
          catch (error) { cleanupErrors.push(error); }
        }
        const message = `WASM could not allocate metabolism buffers for ${nextCapacity} animals`;
        if (cleanupErrors.length) throw aggregateFailure(message, cleanupErrors);
        throw new Error(message);
      }
      const rangesOverlap = inputRangeValid && outputRangeValid
        && nextInputPointer < nextOutputPointer + nextCapacity * OUTPUT_WIDTH * Float64Array.BYTES_PER_ELEMENT
        && nextOutputPointer < nextInputPointer + nextCapacity * INPUT_WIDTH * Float64Array.BYTES_PER_ELEMENT;
      if (!inputRangeValid || !outputRangeValid || rangesOverlap) {
        const cleanupErrors = [];
        if (inputRangeValid && !rangesOverlap) {
          try { release(nextInputPointer, nextCapacity * INPUT_WIDTH); }
          catch (error) { cleanupErrors.push(error); }
        }
        if (outputRangeValid && !rangesOverlap) {
          try { release(nextOutputPointer, nextCapacity * OUTPUT_WIDTH); }
          catch (error) { cleanupErrors.push(error); }
        }
        const cause = cleanupErrors.length ? new AggregateError(cleanupErrors, 'Failed to release invalid metabolism buffers') : undefined;
        throw new Error(`WASM returned invalid metabolism buffer pointers for ${nextCapacity} animals`, {cause});
      }
      if (capacity) {
        const previousInputPointer = inputPointer;
        const previousOutputPointer = outputPointer;
        const previousCapacity = capacity;
        // Switch ownership before freeing old pointers. If a release traps, the
        // adapter remains attached to a valid pair and can be disposed safely.
        capacity = nextCapacity;
        inputPointer = nextInputPointer;
        outputPointer = nextOutputPointer;
        const releaseErrors = [];
        try { release(previousInputPointer, previousCapacity * INPUT_WIDTH); }
        catch (error) { releaseErrors.push(error); }
        try { release(previousOutputPointer, previousCapacity * OUTPUT_WIDTH); }
        catch (error) { releaseErrors.push(error); }
        if (releaseErrors.length) {
          throw aggregateFailure('WASM could not release previous metabolism buffers after capacity growth', releaseErrors);
        }
      } else {
        capacity = nextCapacity;
        inputPointer = nextInputPointer;
        outputPointer = nextOutputPointer;
      }
    }

    const input = new Float64Array(memory.buffer, inputPointer, count * INPUT_WIDTH);
    input.set(values.subarray(0, count * INPUT_WIDTH));
    let status;
    try {
      status = update(count, inputPointer, outputPointer);
    } catch (cause) {
      throw new Error('WASM metabolism call failed; no results were returned', {cause});
    }
    if (status !== 0) throw new Error(`WASM metabolism returned status ${status}`);
    output.set(new Float64Array(memory.buffer, outputPointer, count * OUTPUT_WIDTH),0);
    return output.subarray(0, count * OUTPUT_WIDTH);
  };

  kernel.dispose = () => {
    if (capacity) {
      const buffers = [
        [inputPointer, capacity * INPUT_WIDTH],
        [outputPointer, capacity * OUTPUT_WIDTH],
      ];
      capacity = 0;
      inputPointer = 0;
      outputPointer = 0;
      const releaseErrors = [];
      for (const [pointer, length] of buffers) {
        try { release(pointer, length); }
        catch (error) { releaseErrors.push(error); }
      }
      if (releaseErrors.length) throw aggregateFailure('WASM could not release metabolism buffers during dispose', releaseErrors);
    }
  };
  kernel.memoryBytes = () => memory.buffer.byteLength;
  return kernel;
}
