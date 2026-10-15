async function runMetabolismBatch(input, count, backend, endpoint, fetchImpl) {
  if (!Number.isInteger(count) || count < 1 || count > 10_000) throw new RangeError('invalid metabolism animal count');
  if (!(input instanceof Float64Array) || input.length < count * 4) throw new RangeError('metabolism input buffer is too small');
  const payload = {count, values: Array.from(input.subarray(0, count * 4))};
  if (endpoint === '/api/compute/livestock-metabolism') payload.backend = backend;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error ?? `Compute request failed: ${response.status}`);
  const requested = backend === 'amd' ? 'amd' : backend;
  if (result.backend_requested !== requested || !['cpu', 'cuda', 'amd_rocm'].includes(result.backend_used)
      || typeof result.fallback_used !== 'boolean') throw new Error('Compute service returned invalid backend metadata');
  const values = result.result?.values;
  if (!Array.isArray(values) || values.length !== count * 2 || values.some(value => !Number.isFinite(value))) {
    throw new Error('Compute service returned an invalid metabolism batch');
  }
  const execution = result.execution_metadata ?? {};
  return {values: Float64Array.from(values), backend: result.backend_used,
    backendSelected: result.backend_selected ?? execution.backend_selected ?? result.backend_used,
    requestedBackend: requested, fallbackUsed: result.fallback_used,
    fallbackReason: execution.fallback_reason ?? null,
    device: execution.device_name ?? null, rocmVersion: execution.rocm_version ?? null,
    cudaVersion: execution.cuda_version ?? null, torchVersion: execution.torch_version ?? null,
    backendAvailability: result.backend_availability ?? null};
}

export function runComputeMetabolismBatch(input, count, backend = 'auto', fetchImpl = fetch) {
  if (!['auto', 'cpu', 'cuda', 'rocm'].includes(backend)) throw new TypeError('unsupported compute backend');
  return runMetabolismBatch(input, count, backend, '/api/compute/livestock-metabolism', fetchImpl);
}

// Keep the #137 AMD-specific helper and endpoint available for its runbook.
export function runAmdMetabolismBatch(input, count, fetchImpl = fetch) {
  return runMetabolismBatch(input, count, 'amd', '/api/amd/metabolism-batch', fetchImpl).then(result=>{
    if(result.backend!=='amd_rocm'||result.fallbackUsed){
      throw new Error(`AMD execution was not used (${result.backend}${result.fallbackReason?`: ${result.fallbackReason}`:''})`);
    }
    return result;
  });
}
