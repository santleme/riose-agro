import {Graphics} from 'pixi.js';
import {PRODUCT_WORLD, worldToScreen} from './spatial.js';

const sceneCorners = (x, y, width, height) => [worldToScreen(x, y), worldToScreen(x + width, y), worldToScreen(x + width, y + height), worldToScreen(x, y + height)];

function drawPoly(graphics, points, fill, stroke = null) {
  graphics.poly(points.flatMap(point => [point.x, point.y])).fill(fill);
  if (stroke) graphics.poly(points.flatMap(point => [point.x, point.y])).stroke(stroke);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function stableNoise(x, y, seed = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function addContinuousGrass(graphics, outline) {
  const bounds = outline.reduce((result, point) => ({
    left: Math.min(result.left, point.x), right: Math.max(result.right, point.x),
    top: Math.min(result.top, point.y), bottom: Math.max(result.bottom, point.y),
  }), {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity});
  const step = 8;
  for (let y = bounds.top + 3; y < bounds.bottom; y += step) {
    for (let x = bounds.left + 3; x < bounds.right; x += step) {
      const jitterX = (stableNoise(x, y) - .5) * 3.5;
      const jitterY = (stableNoise(x, y, 1) - .5) * 3.5;
      const px = x + jitterX, py = y + jitterY;
      if (!pointInPolygon({x: px, y: py}, outline)) continue;
      const noise = stableNoise(x, y, 2);
      const radius = .55 + noise * .65;
      const color = noise > .72 ? 0xd2d99a : noise < .2 ? 0x455d37 : 0xb2c584;
      graphics.circle(px, py, radius).fill({color, alpha: noise > .72 ? .21 : .17});
      if (noise > .86) graphics.rect(px + 1, py - 1, 1.1, 2.6).fill({color: 0xd3da9b, alpha: .23});
    }
  }
}

function addPond(depthLayer, pond) {
  // Existing pond and crop atlases are complete diorama patches with soil
  // platforms baked in. Draw these site features on the shared terrain so
  // they read as part of one farm instead of separate floating islands.
  const corners = sceneCorners(pond.x, pond.y, pond.w, pond.h);
  const center = worldToScreen(pond.x + pond.w / 2, pond.y + pond.h / 2);
  const bank = new Graphics();
  drawPoly(bank, corners, 0x9a9a65, {color: 0x6e7650, alpha: .6, width: 1.2});
  const water = new Graphics();
  const inset = sceneCorners(pond.x + .22, pond.y + .2, Math.max(.5, pond.w - .44), Math.max(.4, pond.h - .4));
  drawPoly(water, inset, 0x57999a, {color: 0xd3ce98, alpha: .88, width: 1});
  const glint = new Graphics();
  glint.moveTo(center.x - 12, center.y - 2).lineTo(center.x + 6, center.y + 2)
    .stroke({color: 0xb7dbca, alpha: .65, width: 1.4});
  bank.zIndex = center.y - 1;
  water.zIndex = center.y - .5;
  glint.zIndex = center.y;
  depthLayer.addChild(bank, water, glint);
}

function addCropRows(depthLayer, field) {
  const corners = sceneCorners(field.x, field.y, field.w, field.h);
  const center = worldToScreen(field.x + field.w / 2, field.y + field.h);
  const soil = new Graphics();
  drawPoly(soil, corners, 0x7c7545, {color: 0x657044, alpha: .8, width: 1});
  const rows = new Graphics();
  const count = Math.max(5, Math.round(field.w * 1.7));
  for (let index = 0; index < count; index++) {
    const t = (index + .5) / count;
    const from = worldToScreen(field.x + field.w * t, field.y + .18);
    const to = worldToScreen(field.x + field.w * t, field.y + field.h - .18);
    rows.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({color: 0x443e2d, alpha: .5, width: 1});
    const plants = Math.max(2, Math.round(field.h * 1.45));
    for (let plant = 0; plant < plants; plant++) {
      const ratio = (plant + .45 + stableNoise(index, plant) * .25) / plants;
      const px = from.x + (to.x - from.x) * ratio, py = from.y + (to.y - from.y) * ratio;
      const shade = stableNoise(index, plant, 3) > .5 ? 0x77934a : 0x9fae5b;
      rows.rect(px - .65, py - 1.4, 1.3, 2.8).fill({color: shade, alpha: .9});
    }
  }
  soil.zIndex = center.y - 1;
  rows.zIndex = center.y;
  depthLayer.addChild(soil, rows);
}

function buildFences(depthLayer, geometry) {
  const postPositions = new Map();
  const rememberPost = point => postPositions.set(`${point.x.toFixed(4)},${point.y.toFixed(4)}`, point);
  for (const run of geometry.fenceRuns) {
    const from = run.screenFrom, to = run.screenTo;
    rememberPost(from); rememberPost(to);
    const rails = new Graphics();
    for (const offset of [-5, -2, -.5]) {
      rails.moveTo(from.x, from.y + offset).lineTo(to.x, to.y + offset)
        .stroke({color: offset === -2 ? 0xb89565 : 0x634b32, alpha: offset === -2 ? .92 : .84, width: offset === -2 ? 1.1 : .9});
    }
    rails.zIndex = (from.y + to.y) / 2;
    rails.label = run.id;
    depthLayer.addChild(rails);
  }
  for (const gate of geometry.gates) {
    const from = gate.screenA, to = gate.screenB;
    rememberPost(from); rememberPost(to);
    const rails = new Graphics();
    for (const offset of [-4, 1]) rails.moveTo(from.x, from.y + offset).lineTo(to.x, to.y + offset)
      .stroke({color: 0x936d43, width: 1.4});
    rails.zIndex = (from.y + to.y) / 2 + .1;
    rails.label = gate.id;
    depthLayer.addChild(rails);
  }
  for (const point of postPositions.values()) {
    const post = new Graphics();
    post.rect(point.x - 1, point.y - 8, 2, 8).fill(0x634b32);
    post.rect(point.x - .35, point.y - 8, .55, 7).fill({color: 0xc3a174, alpha: .86});
    post.zIndex = point.y + .2;
    depthLayer.addChild(post);
  }
}

function addTerrain(terrainLayer, scene, geometry) {
  const outline = geometry.outline;
  const sideFaces = new Graphics(), depth = (scene.world ?? PRODUCT_WORLD).soilDepth ?? 18;
  for (const edge of geometry.frontEdges) {
    const offset = {x: 0, y: depth};
    const quad = [edge.from, edge.to, {x: edge.to.x + offset.x, y: edge.to.y + offset.y}, {x: edge.from.x + offset.x, y: edge.from.y + offset.y}];
    drawPoly(sideFaces, quad, edge.shade === 'side' ? 0x765039 : 0x8d6040, {color: 0x604833, alpha: .55, width: .7});
  }
  terrainLayer.addChild(sideFaces);
  const top = new Graphics();
  drawPoly(top, outline, 0x81965f, {color: 0x778c59, alpha: .34, width: .7});
  terrainLayer.addChild(top);

  const groundTexture = new Graphics();
  addContinuousGrass(groundTexture, outline);
  terrainLayer.addChild(groundTexture);

  const paths = new Graphics();
  for (const route of geometry.paths) {
    const points = route.points;
    paths.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) paths.lineTo(points[i].x, points[i].y);
    paths.stroke({color: 0x53432f, alpha: .22, width: 13, cap: 'round', join: 'round'});
    paths.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) paths.lineTo(points[i].x, points[i].y);
    paths.stroke({color: 0xb89a6b, width: 9, cap: 'round', join: 'round'});
  }
  terrainLayer.addChild(paths);

  const paddocks = new Graphics();
  for (const [index, zone] of scene.zones.entries()) {
    const color = zone.kind === 'holdingPen' ? 0xd8b778 : [0xc7d792, 0xd7d99a, 0xb9ce87, 0xcad48b][index];
    drawPoly(paddocks, sceneCorners(zone.x, zone.y, zone.w, zone.h), {color, alpha: .055});
  }
  terrainLayer.addChild(paddocks);
}


export function drawProductLandscape(terrainLayer, depthLayer, scene, geometry) {
  addTerrain(terrainLayer, scene, geometry);
  buildFences(depthLayer, geometry);
  for (const structure of scene.structures ?? []) {
    if (structure.kind === 'pond') addPond(depthLayer, structure);
    else if (structure.kind === 'crops') addCropRows(depthLayer, structure);
  }
}
