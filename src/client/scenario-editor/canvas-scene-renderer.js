import {projectIso} from './scene-layout.js';

function pointFor(position, grid) {
  const point = projectIso(position.col, position.row, grid);
  return {x: point.x + (grid.origin?.x ?? 0), y: point.y + (grid.origin?.y ?? 0)};
}

function drawAsset(context, atlasImages, asset, placement, grid, transform) {
  const image = atlasImages.get(asset.frame.atlas);
  if (!image) return;
  const point = pointFor(placement.position, grid);
  const tileBleed = placement.layer === 'terrain' && placement.properties?.tileKind === 'pasture' ? 2 : 0;
  const width = (asset.displaySize?.[0] ?? 96) * transform.scale + tileBleed * transform.scale;
  const height = (asset.displaySize?.[1] ?? 64) * transform.scale + tileBleed * transform.scale;
  const anchor = placement.anchor ?? asset.anchor ?? {x: 0.5, y: 1};
  context.save();
  context.translate(transform.x + point.x * transform.scale, transform.y + point.y * transform.scale);
  context.rotate((placement.rotation ?? 0) * Math.PI / 180);
  context.drawImage(image, asset.frame.x, asset.frame.y, asset.frame.w, asset.frame.h,
    -width * anchor.x, -height * anchor.y, width, height);
  context.restore();
}

function cameraTransform(viewport, grid, camera) {
  if (camera) return {scale: camera.scale, x: camera.x, y: camera.y};
  const bounds = viewport.getBoundingClientRect();
  const center = projectIso((grid.width - 1) / 2, (grid.height - 1) / 2, grid);
  const scale = Math.min(
    (bounds.width * 0.84) / ((grid.width + grid.height) * grid.tileWidth / 2),
    (bounds.height * 0.84) / ((grid.width + grid.height) * grid.tileHeight / 2),
  );
  return {scale, x: bounds.width / 2 - center.x * scale, y: bounds.height / 2 - center.y * scale};
}

export function createCanvasSceneRenderer(atlasImages) {
  return function renderCanvasScene({canvas, viewport = canvas, scene, placements, assets, camera = null, zonesVisible = true}) {
    if (!canvas || !viewport || !scene) return;
    const bounds = viewport.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(bounds.width * ratio) || canvas.height !== Math.round(bounds.height * ratio)) {
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    const grid = scene.grid;
    const transform = cameraTransform(viewport, grid, camera);
    const visibleLayerIds = new Set(scene.layers.filter(layer => layer.visible).map(layer => layer.id));
    const layerOrder = new Map(scene.layers.map(layer => [layer.id, layer.order]));
    for (const placement of [...placements].sort((a, b) => {
      const orderDifference = (layerOrder.get(a.layer) ?? 99) - (layerOrder.get(b.layer) ?? 99);
      return orderDifference || pointFor(a.position, grid).y - pointFor(b.position, grid).y;
    })) {
      if (!visibleLayerIds.has(placement.layer)) continue;
      const asset = assets.get(placement.assetId);
      if (asset) drawAsset(context, atlasImages, asset, placement, grid, transform);
    }
    if (!zonesVisible) return;
    for (const zone of scene.zones) {
      const points = zone.polygon.map(({col, row}) => pointFor({col, row}, grid));
      context.beginPath();
      points.forEach((point, index) => context[index ? 'lineTo' : 'moveTo'](
        transform.x + point.x * transform.scale,
        transform.y + point.y * transform.scale,
      ));
      context.closePath();
      context.fillStyle = `${zone.color}20`;
      context.fill();
      context.strokeStyle = `${zone.color}aa`;
      context.lineWidth = 1;
      context.stroke();
    }
  };
}
