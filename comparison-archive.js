import {createHash} from 'node:crypto';
import {replayScenarioContract, validateReproducibilityManifest} from './scenario-contract.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function createComparisonArchive(manifestBytes, engineSourceBytes, capturedAt = new Date().toISOString()) {
  const exactManifestBytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  const exactEngineBytes = Buffer.isBuffer(engineSourceBytes) ? engineSourceBytes : Buffer.from(engineSourceBytes);
  const manifest = JSON.parse(exactManifestBytes.toString('utf8'));
  validateReproducibilityManifest(manifest);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('capturedAt precisa ser uma data ISO válida.');

  return {
    type: 'agroville-comparison-result',
    version: 1,
    capturedAt,
    manifestReference: {
      type: manifest.type,
      version: manifest.version,
      sha256: sha256(exactManifestBytes),
    },
    engineSourceSha256: sha256(exactEngineBytes),
    comparison: replayScenarioContract(manifest),
  };
}

export function sha256Bytes(bytes) {
  return sha256(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
}
