const LAYER_ORDER = ['terrain', 'infrastructure', 'livestock', 'overlays'];
const VISUAL_STATES = new Set(['default', 'idle', 'grazing', 'walking', 'feeding', 'drinking', 'resting', 'milking', 'waiting', 'parked', 'connected', 'stocked', 'seasonal']);

function rectangleFromPolygon(zone) {
  const xs = zone.polygon.map(point => point.col), ys = zone.polygon.map(point => point.row);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const corners = new Set(zone.polygon.map(point => `${point.col}:${point.row}`));
  const expected = new Set([`${minX}:${minY}`, `${maxX}:${minY}`, `${minX}:${maxY}`, `${maxX}:${maxY}`]);
  if (corners.size !== 4 || [...expected].some(point => !corners.has(point)) || maxX <= minX || maxY <= minY) {
    throw new TypeError(`Zone ${zone.id} is not an axis-aligned rectangular footprint`);
  }
  return {x: minX, y: minY, columns: maxX - minX, rows: maxY - minY};
}

function stateId(placement) {
  const candidate = placement.properties?.visualState ?? placement.properties?.state ?? 'default';
  return VISUAL_STATES.has(candidate) ? candidate : 'default';
}

export function adaptMainComposerScene(source, rendererManifest) {
  const {scene, expandedPlacements} = source ?? {};
  if (!scene?.metadata?.id || !scene?.grid || !Array.isArray(expandedPlacements)) throw new TypeError('Invalid Scenario Composer source scene');
  const system = scene.metadata.scenarioType;
  if (system !== 'beef' && system !== 'dairy') throw new TypeError(`Unsupported production system ${system}`);
  const assetsById = new Map(rendererManifest.assets.map(asset => [asset.assetId, asset]));
  const zones = scene.zones.map(zone => {
    const rect = rectangleFromPolygon(zone);
    return {
      zoneId: zone.id,
      kind: zone.type,
      name: zone.name,
      color: zone.color,
      origin: {x: rect.x, y: rect.y, unit: 'grid-cell'},
      footprint: {columns: rect.columns, rows: rect.rows},
      groundAssetId: 'grass-light',
      domainZoneId: zone.id,
    };
  });
  const zoneAt = (column, row) => zones.find(zone => column >= zone.origin.x && row >= zone.origin.y
    && column < zone.origin.x + zone.footprint.columns && row < zone.origin.y + zone.footprint.rows)?.zoneId;
  const terrainTiles = [], prefabs = [], entities = [];
  for (const placement of expandedPlacements) {
    const asset = assetsById.get(placement.assetId);
    if (!asset) throw new TypeError(`No renderer manifest record for ${placement.assetId}`);
    const {col, row} = placement.position;
    if (placement.layer === 'terrain') {
      terrainTiles.push({tileId: placement.id, position: {x: col, y: row, unit: 'grid-cell'}, assetId: placement.assetId, ...(zoneAt(col, row) ? {zoneId: zoneAt(col, row)} : {})});
      continue;
    }
    if (placement.layer === 'animals') {
      if (system === 'beef') continue; // The Worker owns the beef population; don't duplicate the Composer's miniature samples.
      const visualId = placement.properties?.visualId ?? placement.id;
      entities.push({
        entityId: `visual-${visualId}`,
        kind: 'animal',
        position: {x: col, y: row, unit: 'grid-cell'},
        asset: {assetId: placement.assetId, manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json', manifestVersion: 'main-composer-v1', reviewStatus: asset.reviewStatus},
        state: {stateId: stateId(placement)},
        ...(placement.properties?.groupId ? {groupId: placement.properties.groupId} : {}),
        visualId,
        ...(placement.properties?.representationMode ? {representationMode: placement.properties.representationMode} : {}),
        ...(Number.isFinite(placement.properties?.visualScale) ? {visualScale: placement.properties.visualScale} : {}),
      });
      continue;
    }
    const footprint = asset.footprint ?? [1, 1];
    const category = asset.category;
    const isNonBlocking = ['fence', 'road', 'vegetation', 'technology'].includes(category);
    prefabs.push({
      prefabId: `composer-${placement.id}`,
      assetId: placement.assetId,
      position: {x: col, y: row, unit: 'grid-cell'},
      footprint: {columns: footprint[0], rows: footprint[1]},
      layer: 'infrastructure',
      state: {stateId: stateId(placement)},
      blocking: !isNonBlocking && asset.blocking,
      ...(placement.properties?.prefabInstanceId ? {compositionId: placement.properties.prefabInstanceId} : {}),
      ...(placement.properties?.prefabId ? {sourcePrefabId: placement.properties.prefabId} : {}),
      rotationDegrees: ((placement.rotation ?? 0) % 360 + 360) % 360,
    });
  }

  const usedAssetIds = new Set(['grass-light', ...terrainTiles.map(tile => tile.assetId), ...prefabs.map(prefab => prefab.assetId), ...entities.map(entity => entity.asset.assetId)]);
  const missingAssets = [...usedAssetIds].filter(assetId => !assetsById.has(assetId));
  if (missingAssets.length) throw new TypeError(`Scene references assets absent from the renderer manifest: ${missingAssets.join(', ')}`);
  const manifestUri = '/graphics-poc/assets/main-composer-render-manifest.json';
  const assets = [...usedAssetIds].sort().map(assetId => ({assetId, manifestUri, manifestVersion: 'main-composer-v1', reviewStatus: assetsById.get(assetId).reviewStatus}));
  const isDairy = system === 'dairy';
  const visualGroups = isDairy ? scene.visualGroups.map(group => ({
    groupId: group.id,
    population: group.population,
    zoneId: group.zoneId,
    operationalState: group.operationalState,
    mode: group.mode,
    seed: group.seed,
    visualEntityIds: entities.filter(entity => entity.groupId === group.id).map(entity => entity.entityId),
  })) : undefined;
  return {
    schemaVersion: '1.0.0',
    sceneId: isDairy ? 'riose-dairy-horizonte' : 'riose-beef-boa-esperanca',
    name: scene.metadata.name,
    domainModule: isDairy
      ? {moduleId: 'livestock-dairy', version: '0.1.0', status: 'in-progress', modelIds: []}
      : {moduleId: 'beef-demo', version: 'engine-farm-v1', status: 'demonstrative-unvalidated', modelIds: ['beef-demo-weight-intake-v1']},
    simulation: {
      scenarioId: scene.metadata.id,
      seed: scene.metadata.seed >>> 0,
      populationCount: scene.metadata.animalCount,
      productionSystem: system,
      initialConditions: isDairy
        ? {layoutOnly: true, modelStatus: 'in-progress', herdLabel: scene.metadata.herdLabel}
        : {housing: 'pasture', weather: 'normal', diet: 'pasture', supplement: 0, herdLabel: scene.metadata.herdLabel},
    },
    provenance: {sourceId: 'scenario-composer-v1', sourceCommit: '2a360cd60bfd3f98d598e12ad5774f5ff4bb8fb7', sourceSceneId: scene.metadata.id},
    projection: {type: 'isometric-2to1', cellWidth: scene.grid.tileWidth, cellHeight: scene.grid.tileHeight, columns: scene.grid.width, rows: scene.grid.height},
    assets,
    entities,
    zones,
    prefabs,
    terrainTiles,
    ...(visualGroups ? {visualGroups} : {}),
    layerOrder: LAYER_ORDER,
  };
}
