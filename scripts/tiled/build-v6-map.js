// Run with: tiled --evaluate build-v6-map.js <repo-root> <compiled-v6-scene.json> <name>
var root = tiled.scriptArguments[0];
var inputPath = tiled.scriptArguments[1];
var outputName = tiled.scriptArguments[2] || 'spatial-v6';
if (!root || !inputPath) throw new Error('Usage: tiled --evaluate build-v6-map.js <repo-root> <compiled-v6-scene.json> [output-name]');
if (!/^[a-z0-9-]+$/.test(outputName)) throw new Error('Map output name must be lowercase kebab-case.');

var sceneFile = new TextFile(inputPath, TextFile.ReadOnly);
var scene = JSON.parse(sceneFile.readAll()); sceneFile.close();
if (!scene.valid || scene.sceneSchemaVersion !== 'riose-compiled-farm-scene-v6') throw new Error('Input is not a valid compiled V6 scene.');
var registryFile = new TextFile(root + '/graphics-poc/asset-registry.json', TextFile.ReadOnly);
var registry = JSON.parse(registryFile.readAll()); registryFile.close();
var records = {};
registry.assets.forEach(function(asset) { records[asset.assetId] = asset; });

var assetIds = [];
scene.placements.concat(scene.vegetation || []).forEach(function(item) {
    if (assetIds.indexOf(item.assetId) < 0) assetIds.push(item.assetId);
});
var tileset = new Tileset('Riose V6 spatial assembly');
tileset.objectAlignment = Tileset.Bottom;
var tilesByAssetId = {};
assetIds.forEach(function(id) {
    var record = records[id];
    if (!record || !record.source || !record.source.file) throw new Error('Missing source art for asset ' + id);
    var tile = tileset.addTile();
    tile.imageFileName = root + '/' + record.source.file;
    tile.setProperty('assetId', id);
    tile.setProperty('reviewStatus', record.reviewStatus || 'UNRESOLVED');
    tile.setProperty('geometryReviewRequired', Boolean(record.spatialGeometry && record.spatialGeometry.reviewRequired));
    tilesByAssetId[id] = tile;
});

var terrain = scene.specification.terrain;
var map = new TileMap();
map.orientation = TileMap.Isometric;
map.setTileSize(96, 48);
map.setSize(terrain.columns, terrain.rows);
map.backgroundColor = tiled.color(37, 44, 40);
map.setProperty('sceneId', 'riose-spatial-v6-' + scene.specification.sceneIntent.productionSystem + '-' + scene.solverIntegration.seed);
map.setProperty('sceneSchemaVersion', scene.sceneSchemaVersion);
map.setProperty('assemblySpecification', scene.specification.schemaVersion);
map.setProperty('productionSystem', scene.specification.sceneIntent.productionSystem);
map.setProperty('seed', scene.solverIntegration.seed);
map.setProperty('solverEngine', scene.solverIntegration.engine);
map.setProperty('solverStatus', scene.solverIntegration.status);
map.setProperty('worldUnit', 'world-cell');
map.setProperty('isometricProjection', '2:1');
map.setProperty('roadGraphJSON', JSON.stringify(scene.roadPaths));
map.setProperty('roadNetworkJSON', JSON.stringify(scene.roadNetwork));
map.setProperty('paddocksJSON', JSON.stringify(scene.paddocks));
map.setProperty('fenceNetworkJSON', JSON.stringify(scene.fenceNetwork));
map.setProperty('corralPrefabJSON', JSON.stringify(scene.corralPrefab));
map.addTileset(tileset);

var layerNames = ['Macro structures', 'Vegetation', 'Road graph', 'Road modules', 'Fence network'];
var groups = {};
layerNames.forEach(function(name) {
    groups[name] = new ObjectGroup(name); groups[name].drawOrder = ObjectGroup.TopDownOrder; map.addLayer(groups[name]);
});
var originX = terrain.columns * 48, originY = 48;
function addSpriteObject(item, vegetation) {
    var asset = records[item.assetId];
    if (!asset || !asset.displaySizePx) throw new Error('Missing display scale for asset ' + item.assetId);
    var object = new MapObject(item.id);
    object.tile = tilesByAssetId[item.assetId];
    object.x = originX + (item.position.x - item.position.y) * 48;
    object.y = originY + (item.position.x + item.position.y) * 24;
    object.width = asset.displaySizePx.width; object.height = asset.displaySizePx.height;
    object.setProperty('assetId', item.assetId);
    object.setProperty('worldX', item.position.x); object.setProperty('worldY', item.position.y);
    object.setProperty('worldUnit', 'world-cell');
    object.setProperty('collisionPolygonJSON', JSON.stringify(item.worldPolygon || records[item.assetId].spatialGeometry.collisionPolygonCandidate));
    object.setProperty('visualHeightCells', asset.spatialGeometry.visualHeightCells);
    object.setProperty('geometryReviewRequired', Boolean(item.reviewRequired || asset.spatialGeometry.reviewRequired));
    object.setProperty('semanticRole', item.role || (vegetation ? 'vegetation' : 'structure'));
    groups[vegetation ? 'Vegetation' : 'Macro structures'].addObject(object);
}
scene.placements.forEach(function(item) { addSpriteObject(item, false); });
(scene.vegetation || []).forEach(function(item) { addSpriteObject(item, true); });
scene.roadPaths.forEach(function(path, index) {
    var object = new MapObject('route-' + index);
    object.x = 0; object.y = 0;
    object.setProperty('from', path.from); object.setProperty('to', path.to);
    object.setProperty('cellsJSON', JSON.stringify(path.cells)); object.setProperty('representation', 'topological-route-data');
    groups['Road graph'].addObject(object);
});
(scene.roadNetwork.modules || []).forEach(function(module) {
    var object = new MapObject(module.moduleId);
    var position = module.position || {x: (module.from.x + module.to.x) / 2, y: (module.from.y + module.to.y) / 2};
    object.x = originX + (position.x - position.y) * 48;
    object.y = originY + (position.x + position.y) * 24;
    object.setProperty('moduleKind', module.kind);
    object.setProperty('socketType', (module.sockets && module.sockets[0] && module.sockets[0].type) || 'road');
    object.setProperty('connectionsJSON', JSON.stringify(module.connections || []));
    object.setProperty('routeOwnersJSON', JSON.stringify(module.owners || module.endpointOwners || []));
    object.setProperty('renderAssetId', module.render && module.render.assetId || '');
    object.setProperty('artReviewStatus', 'UNASSIGNED');
    groups['Road modules'].addObject(object);
});
(scene.fenceNetwork.segments || []).forEach(function(segment) {
    var object = new MapObject(segment.networkSegmentId);
    object.x = 0; object.y = 0;
    object.setProperty('fromJSON', JSON.stringify(segment.from)); object.setProperty('toJSON', JSON.stringify(segment.to));
    object.setProperty('piece', segment.piece); object.setProperty('ownersJSON', JSON.stringify(segment.owners));
    object.setProperty('connected', Boolean(segment.connected));
    groups['Fence network'].addObject(object);
});

var outputDir = root + '/graphics-poc/generated';
File.makePath(outputDir);
var json = tiled.mapFormat('json'), xml = tiled.mapFormat('tmx'), tilesetFormat = tiled.tilesetFormat('tsx');
if (!json || !xml || !tilesetFormat) throw new Error('Tiled CLI is missing JSON, TMX or TSX output format.');
tilesetFormat.write(tileset, outputDir + '/' + outputName + '.tsx');
json.write(map, outputDir + '/' + outputName + '.tmj');
xml.write(map, outputDir + '/' + outputName + '.tmx');
tiled.log(JSON.stringify({version: tiled.version, sceneId: 'riose-spatial-v6-' + scene.specification.sceneIntent.productionSystem + '-' + scene.solverIntegration.seed, structures: scene.placements.length,
    vegetation: (scene.vegetation || []).length, routes: scene.roadPaths.length, roadModules: (scene.roadNetwork.modules || []).length, fenceSegments: (scene.fenceNetwork.segments || []).length,
    files: [outputName + '.tmj', outputName + '.tmx', outputName + '.tsx']}));
