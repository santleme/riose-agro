import {
  PRODUCT_BLOCKOUT,
  productFenceRuns,
  productWorldFrontEdges,
  productWorldOutline,
  worldToScreen,
} from './spatial.js';

// Resolve authored farm geometry once for every renderer. Coordinates in
// outline, paths and screen endpoints are canvas-space; the scene records and
// fence run endpoints remain available in world-space for hit testing.
export function productSceneGeometry(scene = PRODUCT_BLOCKOUT) {
  return {
    outline: productWorldOutline(scene).map(point => worldToScreen(point.x, point.y)),
    frontEdges: productWorldFrontEdges(scene),
    paths: (scene.paths ?? []).map(route => ({
      ...route,
      points: route.cells.map(([x, y]) => worldToScreen(x + .5, y + .5)),
    })),
    fenceRuns: productFenceRuns(scene).map(run => ({
      ...run,
      screenFrom: worldToScreen(run.from.x, run.from.y),
      screenTo: worldToScreen(run.to.x, run.to.y),
    })),
    gates: (scene.gates ?? []).map(gate => ({
      ...gate,
      screenA: worldToScreen(gate.a.x, gate.a.y),
      screenB: worldToScreen(gate.b.x, gate.b.y),
    })),
  };
}
