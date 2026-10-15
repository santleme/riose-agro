import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buildTerrainWorldV8, validateTerrainWorldV8, waterTileAssetId} from '../../src/client/terrain-world-v8.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const model = buildTerrainWorldV8();
const validation = validateTerrainWorldV8(model);
if (!validation.valid) throw new Error(`Terrain V8 geometry invalid: ${validation.errors.join(', ')}`);

const tiles = model.cells.flat().map(cell => ({
  position: {x: cell.x, y: cell.y},
  assetId: cell.material === 'water' ? waterTileAssetId(model.cells, cell.x, cell.y) : `world-v8-${cell.material}`,
  zoneId: null,
  elevation: cell.elevation,
  material: cell.material,
  slope: cell.inclination,
  navigable: cell.navigable,
  occupancy: cell.occupancy,
  connectivity: cell.connectivity,
  transition: cell.transition,
}));
const prefabs = model.objects.map(object => ({
  prefabId: object.id,
  assetId: object.assetId,
  layer: 'infrastructure',
  position: {x: object.x - object.width / 2, y: object.y - object.height / 2, unit: 'grid-cell'},
  footprint: {columns: object.width, rows: object.height},
  blocking: object.assetId !== 'world-v8-tree',
  spatialGeometry: {contactAnchor: object.anchor, collisionPolygon: object.assetId === 'world-v8-bridge' ? object.collisionPolygon : []},
}));

const scene = {
  schemaVersion: '1.0.0',
  representationRole: 'runtime-presentation',
  sceneId: model.id,
  name: 'Prova de terreno · platô, rampa e córrego',
  domainModule: {moduleId: 'world-terrain-preview', version: 'terrain-world-v8', status: 'review', modelIds: []},
  simulation: {scenarioId: 'visual-terrain-proof-v8', seed: 84018, populationCount: 0, productionSystem: 'visual-only', initialConditions: {}},
  visualVariant: {id: 'terrain-v8-proof', label: 'Etapa 1 · prova de terreno', status: 'presentation-only'},
  projection: {type: 'isometric-2to1', cellWidth: 96, cellHeight: 48, columns: model.dimensions.columns, rows: model.dimensions.rows},
  terrainTiles: tiles,
  terrainV8: model,
  zones: [],
  prefabs,
  entities: [],
  assetInstances: [],
};

const output = path.join(root, 'graphics-poc/scenes/terrain-v8.json');
await mkdir(path.dirname(output), {recursive: true});
await writeFile(output, `${JSON.stringify(scene, null, 2)}\n`);
console.log(JSON.stringify({output: path.relative(root, output), cells: tiles.length, cliffs: model.cliffSegments.length, routeCells: model.routes.navigable.length, bridgePath: model.routes.bridgeCrossing, valid: validation.valid}, null, 2));
