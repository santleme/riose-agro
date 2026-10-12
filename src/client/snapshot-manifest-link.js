import {createHash} from 'node:crypto';
import {validateReproducibilityManifest} from './scenario-contract.js';

export function linkFarmSnapshotToManifest(snapshot, manifestBytes) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Snapshot precisa ser um objeto.');
  }
  if (snapshot.snapshotKind === 'observed-study-slice') {
    throw new Error('Recorte observacional de estudo não pode ser ligado como estado-base de uma comparação do motor.');
  }
  if (snapshot.manifestReference?.status !== 'not-linked') {
    throw new Error('Snapshot precisa estar com manifestReference.status=not-linked; gere uma nova cópia para trocar o vínculo.');
  }

  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  const manifest = JSON.parse(bytes.toString('utf8'));
  validateReproducibilityManifest(manifest);

  const linkedSnapshot = structuredClone(snapshot);
  linkedSnapshot.manifestReference = {
    status: 'linked',
    type: manifest.type,
    version: manifest.version,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  return linkedSnapshot;
}

export function validateFarmSnapshotManifestReference(snapshot, manifestBytes) {
  const errors = [];
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    return {checked: true, valid: false, errors: ['Não foi possível ler o JSON do manifesto selecionado.']};
  }
  try {
    validateReproducibilityManifest(manifest);
  } catch (error) {
    errors.push(`Manifesto de comparação inválido: ${error.message}`);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== snapshot?.manifestReference?.sha256) errors.push('SHA-256 do manifesto não corresponde a manifestReference.sha256.');
  if (manifest?.type !== snapshot?.manifestReference?.type || manifest?.version !== snapshot?.manifestReference?.version) {
    errors.push('Tipo/versão do manifesto não corresponde a manifestReference.');
  }
  return {checked: true, valid: errors.length === 0, errors};
}
