// Executed by Tiled 1.12+ via `tiled --evaluate`; no editor UI or manual map edits.
var root = tiled.scriptArguments[0];
if (!root) throw new Error('Usage: tiled --evaluate build-scene.js <repo-root>');
var sceneInput = tiled.scriptArguments[1] || 'assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json';
var outputName = tiled.scriptArguments[2] || 'ranch-v4';
if (!/^[a-z0-9-]+$/.test(outputName)) throw new Error('Map output name must be lowercase kebab-case.');
var scenePath = root + '/' + sceneInput;
var manifestPath = root + '/assets/manifests/manifest.json';
var sceneFile = new TextFile(scenePath, TextFile.ReadOnly);
var manifestFile = new TextFile(manifestPath, TextFile.ReadOnly);
var terrainDirectory = root + '/graphics-poc/generated/terrain-v5';
var selectionFile = new TextFile(terrainDirectory + '/selection.json', TextFile.ReadOnly);
var scene = JSON.parse(sceneFile.readAll());
var manifest = JSON.parse(manifestFile.readAll());
var terrainSelection = JSON.parse(selectionFile.readAll());
sceneFile.close(); manifestFile.close(); selectionFile.close();
var terrainFile = new TextFile(terrainDirectory + '/' + terrainSelection.selectedProposal + '.json', TextFile.ReadOnly);
var terrain = JSON.parse(terrainFile.readAll()); terrainFile.close();
var terrainPng = terrainDirectory + '/' + terrainSelection.selectedProposal + '.png';
if (!File.exists(terrainPng)) throw new Error('Selected terrain render missing; run npm run build:terrain-proposals first.');

function terrainHeightAtAnchor(screenX, screenY) {
    var projection = terrain.projection;
    var sourceX = projection.sourceGroundPixelsPerWorldUnit.horizontalAxis;
    var sourceY = projection.sourceGroundPixelsPerWorldUnit.verticalAxis;
    var dx = (screenX - projection.sourceCenterPx[0]) / sourceX;
    var dy = (screenY - projection.sourceCenterPx[1]) / sourceY;
    var worldX = (dx + dy) / 2;
    var worldY = (dy - dx) / 2;
    var nx = Math.max(0, Math.min(1, worldX / terrain.grid.worldSize[0] + 0.5));
    var ny = Math.max(0, Math.min(1, worldY / terrain.grid.worldSize[1] + 0.5));
    var gridX = nx * (terrain.grid.columns - 1), gridY = ny * (terrain.grid.rows - 1);
    var x0 = Math.floor(gridX), y0 = Math.floor(gridY);
    var x1 = Math.min(terrain.grid.columns - 1, x0 + 1), y1 = Math.min(terrain.grid.rows - 1, y0 + 1);
    var tx = gridX - x0, ty = gridY - y0;
    var a = terrain.heightmap[y0][x0] * (1 - tx) + terrain.heightmap[y0][x1] * tx;
    var b = terrain.heightmap[y1][x0] * (1 - tx) + terrain.heightmap[y1][x1] * tx;
    return {worldX: worldX, worldY: worldY, elevationWorldUnits: a * (1 - ty) + b * ty};
}
var records = {};
manifest.assets.forEach(function(asset) { records[asset.id] = asset; });
var assetIds = [];
scene.placements.forEach(function(item) { if (assetIds.indexOf(item.assetId) < 0) assetIds.push(item.assetId); });
var tileset = new Tileset('Riose V4 sprites');
tileset.objectAlignment = Tileset.Bottom;
var tilesByAssetId = {};
assetIds.forEach(function(id) {
    var record = records[id];
    if (!record) throw new Error('Missing asset registry entry: ' + id);
    var tile = tileset.addTile();
    tile.imageFileName = root + '/' + record.file;
    tile.setProperty('assetId', id);
    tile.setProperty('reviewStatus', record.status || 'UNRESOLVED');
    tilesByAssetId[id] = tile;
});

var map = new TileMap();
map.orientation = TileMap.Isometric;
map.setTileSize(84, 42);
map.setSize(28, 14);
map.backgroundColor = tiled.color(246, 245, 239);
map.setProperty('sceneId', scene.sceneId);
map.setProperty('sceneVersion', scene.schemaVersion);
map.setProperty('projection', 'isometric-2:1');
map.setProperty('terrainProposal', terrainSelection.selectedProposal);
map.setProperty('terrainSeed', terrain.seed);
map.setProperty('terrainHeightLevels', terrain.heightLevels.length);
map.setProperty('surfaceMaterialGrammar', terrain.materials.surfaceGrammar || 'unassigned');
map.setProperty('surfaceMaterialZones', JSON.stringify(terrain.materials.surfaceMaterialZones || []));
map.addTileset(tileset);

var ground = new ImageLayer('Ground plate');
ground.imageFileName = terrainPng;
map.addLayer(ground);
var grounding = new ObjectGroup('Grounding overlays');
map.addLayer(grounding);
scene.groundingOverlays.forEach(function(overlay, index) {
    var object = new MapObject('grounding-' + index);
    object.x = overlay.centerPx[0]; object.y = overlay.centerPx[1];
    object.width = overlay.renderSizePx[0]; object.height = overlay.renderSizePx[1];
    object.setProperty('assetId', overlay.assetId);
    object.setProperty('opacity', overlay.opacity);
    object.setProperty('layer', overlay.layer);
    grounding.addObject(object);
});

var groups = {};
['Infrastructure', 'Vegetation', 'Water', 'Livestock', 'Technology'].forEach(function(name) {
    groups[name] = new ObjectGroup(name); groups[name].drawOrder = ObjectGroup.TopDownOrder; map.addLayer(groups[name]);
});
scene.placements.slice().sort(function(a, b) { return (a.depthKey || a.anchorPx[1]) - (b.depthKey || b.anchorPx[1]); }).forEach(function(item) {
    var record = records[item.assetId];
    var category = record.category === 'livestock' ? 'Livestock' : record.category === 'vegetation' ? 'Vegetation' : record.category === 'water' ? 'Water' : record.category === 'technology' ? 'Technology' : 'Infrastructure';
    var object = new MapObject(item.placementId);
    object.tile = tilesByAssetId[item.assetId];
    var support = terrainHeightAtAnchor(item.anchorPx[0], item.anchorPx[1]);
    var renderProjection = terrain.projection;
    object.x = renderProjection.renderCenterPx[0] + (support.worldX - support.worldY) * renderProjection.renderGroundPixelsPerWorldUnit.horizontalAxis;
    object.y = renderProjection.renderCenterPx[1] + (support.worldX + support.worldY) * renderProjection.renderGroundPixelsPerWorldUnit.verticalAxis - support.elevationWorldUnits * renderProjection.renderHeightPixelsPerWorldUnit;
    object.width = item.requestedSizePx[0]; object.height = item.requestedSizePx[1];
    object.rotation = -(item.transform && item.transform.rotationDegreesCCW || 0);
    object.setProperty('placementId', item.placementId);
    object.setProperty('assetId', item.assetId);
    object.setProperty('depthKey', object.y);
    object.setProperty('terrainElevationWorldUnits', support.elevationWorldUnits);
    object.setProperty('terrainElevationMeters', support.elevationWorldUnits * terrain.grid.metersPerWorldUnit);
    object.setProperty('sourceAnchorPx', item.anchorPx[0] + ',' + item.anchorPx[1]);
    object.setProperty('visualFootprintPx', item.requestedSizePx[0] + 'x' + item.requestedSizePx[1]);
    object.setProperty('worldAnchor', 'ground-contact');
    object.setProperty('anchorNormalizedX', (item.anchorNormalized || [record.anchor.x, record.anchor.y])[0]);
    object.setProperty('anchorNormalizedY', (item.anchorNormalized || [record.anchor.x, record.anchor.y])[1]);
    object.setProperty('sourcePath', record.file);
    object.tileFlippedHorizontally = Boolean(item.transform && item.transform.flip === 'h');
    object.tileFlippedVertically = Boolean(item.transform && item.transform.flip === 'v');
    groups[category].addObject(object);
});

var out = root + '/graphics-poc/generated';
File.makePath(out);
var json = tiled.mapFormat('json');
var xml = tiled.mapFormat('tmx');
var tilesetFormat = tiled.tilesetFormat('tsx');
if (!json || !xml || !tilesetFormat) throw new Error('Tiled build is missing JSON/TMX/TSX formats.');
tilesetFormat.write(tileset, out + '/' + outputName + '.tsx');
json.write(map, out + '/' + outputName + '.tmj');
xml.write(map, out + '/' + outputName + '.tmx');
tiled.log(JSON.stringify({version: tiled.version, sceneId: scene.sceneId, placements: scene.placements.length, uniqueTiles: assetIds.length, layers: map.layerCount, files: [outputName + '.tsx', outputName + '.tmj', outputName + '.tmx']}));
