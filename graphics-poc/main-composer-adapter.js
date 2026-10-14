import compiledGeometry from './asset-geometry-v1.json' with {type: 'json'};

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

function dairyPastureZones(sourceZones) {
  return sourceZones.flatMap(zone => {
    if (zone.type !== 'pasture') return [zone];
    const rect = rectangleFromPolygon(zone);
    const westColumns = Math.ceil(rect.columns / 2);
    const splitX = rect.x + westColumns;
    const northSouth = zone.id.endsWith('north') ? 'north' : 'south';
    return [
      {
        ...zone,
        id: `zone-pasture-${northSouth}-west`,
        name: `Piquete ${northSouth === 'north' ? 'Norte' : 'Sul'} Oeste`,
        polygon: [
          {col: rect.x, row: rect.y}, {col: splitX, row: rect.y},
          {col: splitX, row: rect.y + rect.rows}, {col: rect.x, row: rect.y + rect.rows},
        ],
      },
      {
        ...zone,
        id: `zone-pasture-${northSouth}-east`,
        name: `Piquete ${northSouth === 'north' ? 'Norte' : 'Sul'} Leste`,
        polygon: [
          {col: splitX, row: rect.y}, {col: rect.x + rect.columns, row: rect.y},
          {col: rect.x + rect.columns, row: rect.y + rect.rows}, {col: splitX, row: rect.y + rect.rows},
        ],
      },
    ];
  });
}

function dairyRotationalFences(prefabs, assetsById) {
  const fenceAssetId = 'fence-wire-wood-post-imagegen-v1';
  const gateAssetId = 'fence-gate-wood-imagegen-v1';
  if (!assetsById.has(fenceAssetId) || !assetsById.has(gateAssetId)) {
    throw new TypeError('Dairy rotational paddocks require reviewed fence and gate assets');
  }
  for (const [section, firstRow, lastRow, gateRow] of [['north', 1, 10, 5], ['south', 13, 22, 17]]) {
    for (let row = firstRow; row <= lastRow; row++) {
      const isGate = row === gateRow;
      const assetId = isGate ? gateAssetId : fenceAssetId;
      prefabs.push({
        prefabId: `dairy-rotation-${section}-${isGate ? 'gate' : 'fence'}-row-${row}`,
        assetId,
        position: {x: 10, y: row, unit: 'grid-cell'},
        footprint: {columns: 1, rows: 1},
        layer: 'infrastructure',
        state: {stateId: 'default'},
        blocking: false,
        sourcePrefabId: isGate ? 'dairy-pasture-rotation-gate' : 'dairy-pasture-rotation-fence',
        rotationDegrees: 90,
      });
    }
  }
}

function splitDairyGroups(groups, entities) {
  for (const entity of entities) {
    if (!entity.groupId?.startsWith('dairy-north-lot') && !entity.groupId?.startsWith('dairy-south-lot')) continue;
    const region = entity.position.y < 10 ? 'north' : 'south';
    const side = entity.position.x < 10 ? 'west' : 'east';
    entity.groupId = `dairy-${region}-${side}-lot`;
  }
  const rotationalGroups = [];
  for (const group of groups) {
    if (!['zone-pasture-north', 'zone-pasture-south'].includes(group.zoneId)) {
      rotationalGroups.push({
        groupId: group.id,
        population: group.population,
        zoneId: group.zoneId,
        operationalState: group.operationalState,
        mode: group.mode,
        seed: group.seed,
        visualEntityIds: entities.filter(entity => entity.groupId === group.id).map(entity => entity.entityId),
      });
      continue;
    }
    const region = group.zoneId.endsWith('north') ? 'north' : 'south';
    for (const side of ['west', 'east']) {
      const groupId = `dairy-${region}-${side}-lot`;
      rotationalGroups.push({
        groupId,
        population: group.population / 2,
        zoneId: `zone-pasture-${region}-${side}`,
        operationalState: group.operationalState,
        mode: group.mode,
        seed: group.seed,
        visualEntityIds: entities.filter(entity => entity.groupId === groupId).map(entity => entity.entityId),
      });
    }
  }
  return rotationalGroups;
}

export function adaptMainComposerScene(source, rendererManifest) {
  const {scene, expandedPlacements} = source ?? {};
  if (!scene?.metadata?.id || !scene?.grid || !Array.isArray(expandedPlacements)) throw new TypeError('Invalid Scenario Composer source scene');
  const system = scene.metadata.scenarioType;
  if (system !== 'beef' && system !== 'dairy') throw new TypeError(`Unsupported production system ${system}`);
  const assetsById = new Map(rendererManifest.assets.map(asset => [asset.assetId, asset]));
  const sourceZones = system === 'dairy' ? dairyPastureZones(scene.zones) : scene.zones;
  const zones = sourceZones.map(zone => {
    const rect = rectangleFromPolygon(zone);
    return {
      zoneId: zone.id,
      kind: zone.type,
      name: zone.name,
      color: zone.color,
      origin: {x: rect.x, y: rect.y, unit: 'grid-cell'},
      footprint: {columns: rect.columns, rows: rect.rows},
      groundAssetId: 'grass-light',
      domainZoneId: zone.id.startsWith('zone-pasture-') && (zone.id.includes('-west') || zone.id.includes('-east'))
        ? `zone-pasture-${zone.id.includes('-north-') ? 'north' : 'south'}` : zone.id,
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
        asset: {
          assetId: placement.assetId,
          manifestUri: '/graphics-poc/assets/main-composer-render-manifest.json',
          manifestVersion: 'main-composer-v1',
          reviewStatus: asset.reviewStatus ?? 'UNRESOLVED',
          sourceStatus: asset.sourceStatus ?? asset.reviewStatus ?? 'UNRESOLVED',
          sourceSemanticId: asset.sourceSemanticId ?? null,
          sourceFile: asset.sourceFile ?? null,
          sourceManifest: asset.sourceManifest ?? asset.manifestSource ?? null,
          rights: asset.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this asset.'},
        },
        state: {stateId: stateId(placement)},
        ...(placement.properties?.groupId ? {groupId: placement.properties.groupId} : {}),
        visualId,
        ...(placement.properties?.representationMode ? {representationMode: placement.properties.representationMode} : {}),
        ...(Number.isFinite(placement.properties?.visualScale) ? {visualScale: placement.properties.visualScale} : {}),
      });
      continue;
    }
    const geometry = asset.spatialGeometry ?? compiledGeometry.assets[placement.assetId];
    if (!geometry || geometry.geometryStatus === 'missing-source' || geometry.units !== 'world-cell') {
      throw new TypeError(`Asset ${placement.assetId} has no compiled world-cell geometry`);
    }
    const footprint = geometry.groundFootprintCandidate;
    if (!footprint || !Number.isFinite(footprint.columns) || !Number.isFinite(footprint.rows)) {
      throw new TypeError(`Asset ${placement.assetId} has no measurable ground footprint candidate`);
    }
    const category = asset.category;
    prefabs.push({
      prefabId: `composer-${placement.id}`,
      assetId: placement.assetId,
      position: {x: col, y: row, unit: 'world-cell'},
      footprint: {columns: footprint.columns, rows: footprint.rows},
      spatialGeometry: {
        status: geometry.geometryStatus,
        reviewRequired: geometry.reviewRequired,
        units: geometry.units,
        groundContactAnchor: geometry.groundContactAnchor,
        collisionPolygon: geometry.collisionPolygonCandidate,
        visualBoundingBoxPx: geometry.visualBoundingBoxPx,
        visualHeightCells: geometry.visualHeightCells,
        clearanceCells: geometry.clearanceCells,
        supportedOrientations: geometry.supportedOrientations,
      },
      layer: 'infrastructure',
      state: {stateId: stateId(placement)},
      blocking: geometry.collisionPolicy === 'blocking',
      ...(placement.properties?.prefabInstanceId ? {compositionId: placement.properties.prefabInstanceId} : {}),
      ...(placement.properties?.prefabId ? {sourcePrefabId: placement.properties.prefabId} : {}),
      rotationDegrees: ((placement.rotation ?? 0) % 360 + 360) % 360,
    });
  }

  if (system === 'dairy') {
    const eastLotRepresentative = entities.find(entity => entity.visualId === 'dairy-visual-06');
    if (eastLotRepresentative) eastLotRepresentative.position.x = 13.25;
    dairyRotationalFences(prefabs, assetsById);
  }

  const usedAssetIds = new Set(['grass-light', ...terrainTiles.map(tile => tile.assetId), ...prefabs.map(prefab => prefab.assetId), ...entities.map(entity => entity.asset.assetId)]);
  const missingAssets = [...usedAssetIds].filter(assetId => !assetsById.has(assetId));
  if (missingAssets.length) throw new TypeError(`Scene references assets absent from the renderer manifest: ${missingAssets.join(', ')}`);
  const manifestUri = '/graphics-poc/assets/main-composer-render-manifest.json';
  const assets = [...usedAssetIds].sort().map(assetId => {
    const asset = assetsById.get(assetId);
    return {
      assetId,
      manifestUri,
      manifestVersion: 'main-composer-v1',
      reviewStatus: asset.reviewStatus ?? 'UNRESOLVED',
      sourceStatus: asset.sourceStatus ?? asset.reviewStatus ?? 'UNRESOLVED',
      sourceSemanticId: asset.sourceSemanticId ?? null,
      sourceFile: asset.sourceFile ?? null,
      sourceManifest: asset.sourceManifest ?? asset.manifestSource ?? null,
      rights: asset.rights ?? {licenseState: 'unknown', notes: 'No source rights record resolves for this asset.'},
    };
  });
  const isDairy = system === 'dairy';
  const visualGroups = isDairy ? splitDairyGroups(scene.visualGroups, entities) : undefined;
  return {
    schemaVersion: '1.0.0',
    representationRole: 'runtime-presentation',
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
