export async function runAmdMetabolismBatch(input, count, fetchImpl = fetch) {
  if (!Number.isInteger(count) || count < 1 || count > 10_000) throw new RangeError('invalid metabolism animal count');
  if (!(input instanceof Float64Array) || input.length < count * 4) throw new RangeError('metabolism input buffer is too small');
  const response = await fetchImpl('/api/amd/metabolism-batch', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({count, values: Array.from(input.subarray(0, count * 4))}),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error ?? `AMD compute request failed: ${response.status}`);
  if (result.backend_requested !== 'amd' || result.backend_used !== 'amd_rocm' || result.fallback_used !== false) {
    throw new Error(`AMD execution was not used (${result.backend_used ?? 'unknown backend'}${result.execution_metadata?.fallback_reason ? `: ${result.execution_metadata.fallback_reason}` : ''})`);
  }
  const values = result.result?.values;
  if (!Array.isArray(values) || values.length !== count * 2 || values.some(value => !Number.isFinite(value))) {
    throw new Error('AMD compute service returned an invalid metabolism batch');
  }
  return {values: Float64Array.from(values), backend: result.backend_used,
    device: result.execution_metadata?.device_name ?? null, rocmVersion: result.execution_metadata?.rocm_version ?? null};
}
