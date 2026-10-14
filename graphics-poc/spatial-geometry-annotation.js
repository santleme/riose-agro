/** Geometry helpers shared by the browser annotator and its focused tests. */
export function validateConvexWorldPolygon(points, epsilon = 1e-7) {
  if (!Array.isArray(points) || points.length < 3) return {valid: false, reason: 'too-few-points'};
  if (points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return {valid: false, reason: 'non-finite-coordinate'};
  }
  for (let index = 0; index < points.length; index++) {
    const here = points[index], next = points[(index + 1) % points.length];
    if (Math.hypot(next.x - here.x, next.y - here.y) <= epsilon) return {valid: false, reason: 'duplicate-adjacent-point'};
  }
  let winding = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length], c = points[(index + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) <= epsilon) continue;
    if (winding && Math.sign(cross) !== winding) return {valid: false, reason: 'non-convex-or-out-of-order'};
    winding = Math.sign(cross);
  }
  const twiceArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  if (!winding || Math.abs(twiceArea) <= epsilon) return {valid: false, reason: 'zero-area'};
  return {valid: true, reason: null, area: Math.abs(twiceArea) / 2};
}

export function worldCellFromSpritePixel({x, y, pivot, imageWidth, imageHeight, displayWidth, displayHeight, cellWidth, cellHeight}) {
  const scale = Math.min(displayWidth / imageWidth, displayHeight / imageHeight);
  const dx = (x - pivot.x * imageWidth) * scale;
  const dy = (y - pivot.y * imageHeight) * scale;
  const horizontal = dx / (cellWidth / 2), vertical = dy / (cellHeight / 2);
  return {x: (horizontal + vertical) / 2, y: (vertical - horizontal) / 2};
}

export function spritePixelFromWorldCell({x, y, pivot, imageWidth, imageHeight, displayWidth, displayHeight, cellWidth, cellHeight}) {
  const scale = Math.min(displayWidth / imageWidth, displayHeight / imageHeight);
  const dx = (x - y) * cellWidth / 2, dy = (x + y) * cellHeight / 2;
  return {x: pivot.x * imageWidth + dx / scale, y: pivot.y * imageHeight + dy / scale};
}

export function validateAnnotationDocument(document, assetIds) {
  if (document?.schemaVersion !== '1.0.0' || document.units !== 'world-cell' || document.projection !== 'isometric-2to1' || !document.assets || typeof document.assets !== 'object' || Array.isArray(document.assets)) {
    return ['Expected annotation schema 1.0.0, world-cell units and isometric-2to1 projection.'];
  }
  const errors = [];
  for (const [assetId, annotation] of Object.entries(document.assets)) {
    if (!assetIds.has(assetId)) errors.push(`Unknown asset ${assetId}.`);
    const polygon = validateConvexWorldPolygon(annotation?.collisionPolygon);
    if (!polygon.valid) errors.push(`${assetId}: invalid collision polygon (${polygon.reason}).`);
    if (!['draft', 'reviewed'].includes(annotation?.reviewStatus)) errors.push(`${assetId}: invalid review status.`);
    if (annotation?.reviewStatus === 'reviewed' && !annotation?.reviewer?.trim()) errors.push(`${assetId}: reviewed annotation needs a reviewer.`);
    if (annotation?.provenance?.geometryBasis !== 'visual-sprite-estimate') errors.push(`${assetId}: provenance must identify a visual sprite estimate.`);
  }
  return errors;
}
