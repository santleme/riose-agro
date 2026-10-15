export function validateGridScene(candidate, {prefabs = [], manifest, layers = [], validateLayout} = {}) {
  const errors = [];
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.grid || !Array.isArray(candidate.placements)) errors.push('O arquivo não corresponde ao schema Riose Scene v1.');
  if (!Array.isArray(candidate.layers) || !Array.isArray(candidate.zones) || !Array.isArray(candidate.prefabInstances)) errors.push('A cena precisa conter layers, zones e prefabInstances.');
  if (candidate.grid?.projection !== 'isometric-2-to-1') errors.push('A projeção precisa ser isometric-2-to-1.');
  for (const diagnostic of validateLayout(candidate, {
    prefabs,
    manifest,
    constraints: candidate.generation?.constraints ?? [],
  })) if (diagnostic.severity === 'error') errors.push(diagnostic.message);
  const assetIds = new Set(manifest.assets.map((asset) => asset.id));
  const unknown = [...new Set((candidate.placements ?? []).map((item) => item.assetId).filter((id) => !assetIds.has(id)))];
  if (unknown.length) errors.push(`Assets ausentes no manifesto: ${unknown.slice(0, 6).join(', ')}`);
  const prefabIds = new Set(prefabs.map((prefab) => prefab.id));
  const missingPrefabs = [...new Set((candidate.prefabInstances ?? []).map((item) => item.prefabId).filter((id) => !prefabIds.has(id)))];
  if (missingPrefabs.length) errors.push(`Prefabs desconhecidos: ${missingPrefabs.join(', ')}`);
  const layerIds = new Set(layers);
  for (const layer of candidate.layers ?? []) if (!layerIds.has(layer.id)) errors.push(`Camada desconhecida: ${layer.id}`);
  if (Array.isArray(candidate.visualGroups)) {
    const groupIds = new Set(candidate.visualGroups.map((group) => group.id));
    const visualIds = new Set();
    for (const group of candidate.visualGroups) {
      if (!candidate.zones.some((zone) => zone.id === group.zoneId)) errors.push(`Zona ausente no lote visual ${group.id}.`);
      if (group.visualIds.length > group.maxSprites) errors.push(`O lote ${group.id} excede o orçamento de sprites.`);
      if (group.visualIds.some((id) => visualIds.has(id))) errors.push(`Visual ID repetido no lote ${group.id}.`);
      group.visualIds.forEach((id) => visualIds.add(id));
    }
    const population = candidate.visualGroups.reduce((sum, group) => sum + group.population, 0);
    if (Number.isInteger(candidate.metadata?.animalCount) && population !== candidate.metadata.animalCount) errors.push('A população dos lotes visuais não corresponde ao total do cenário.');
    const visualPlacements = [...candidate.placements, ...expandedPrefabPlacementsFor(candidate, prefabs)].filter((item) => item.layer === 'animals');
    if (Number.isInteger(candidate.metadata?.visualBudget) && visualPlacements.length > candidate.metadata.visualBudget) errors.push('A cena ultrapassa seu orçamento visual de animais.');
    if (Number.isInteger(candidate.metadata?.visibleAnimalCount) && visualPlacements.length !== candidate.metadata.visibleAnimalCount) errors.push('A contagem de animais visíveis não corresponde aos placements.');
    for (const item of visualPlacements) {
      const props = item.properties ?? {};
      if (props.sourceKind === 'lot-representative' && (!groupIds.has(props.groupId) || !visualIds.has(props.visualId))) errors.push(`Sprite representativo sem lote/visual ID válido: ${item.id}.`);
      if (props.sourceKind === 'lot-representative' && props.animalId) errors.push(`Sprite de grupo não pode alegar identidade individual: ${item.id}.`);
    }
  }
  return errors;
}

function expandedPrefabPlacementsFor(candidate, prefabs) {
  const result = [];
  for (const instance of candidate.prefabInstances ?? []) {
    const prefab = prefabs.find((item) => item.id === instance.prefabId);
    for (const [index, child] of (prefab?.placements ?? []).entries()) result.push({id: `${instance.id}::${index}`, assetId: child.assetId, layer: child.layer, properties: child.properties ?? {}});
  }
  return result;
}
