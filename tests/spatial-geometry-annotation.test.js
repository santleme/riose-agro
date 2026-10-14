import test from 'node:test';
import assert from 'node:assert/strict';
import {spritePixelFromWorldCell, validateAnnotationDocument, validateConvexWorldPolygon, worldCellFromSpritePixel} from '../graphics-poc/spatial-geometry-annotation.js';

const transform = {pivot: {x: 0.43, y: 0.91}, imageWidth: 547, imageHeight: 414, displayWidth: 172, displayHeight: 128, cellWidth: 96, cellHeight: 48};

test('sprite pixels and world-cell use a reversible uniform Pixi scale around the ground pivot', () => {
  for (const pixel of [{x: 0, y: 0}, {x: 235.5, y: 371.25}, {x: 547, y: 414}]) {
    const world = worldCellFromSpritePixel({...pixel, ...transform});
    const restored = spritePixelFromWorldCell({...world, ...transform});
    assert.ok(Math.abs(restored.x - pixel.x) < 1e-9);
    assert.ok(Math.abs(restored.y - pixel.y) < 1e-9);
  }
});

test('convex polygon validator rejects duplicate, collinear and self-crossed outlines', () => {
  assert.equal(validateConvexWorldPolygon([{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 1}, {x: 0, y: 1}]).valid, true);
  assert.equal(validateConvexWorldPolygon([{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 0}, {x: 0, y: 1}]).reason, 'duplicate-adjacent-point');
  assert.equal(validateConvexWorldPolygon([{x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}]).reason, 'zero-area');
  assert.equal(validateConvexWorldPolygon([{x: 0, y: 0}, {x: 2, y: 0}, {x: 1, y: 0.5}, {x: 2, y: 2}, {x: 0, y: 2}]).reason, 'non-convex-or-out-of-order');
});

test('annotation documents require explicit provenance and a known asset', () => {
  const document = {schemaVersion: '1.0.0', units: 'world-cell', projection: 'isometric-2to1', assets: {
    known: {reviewStatus: 'draft', provenance: {geometryBasis: 'visual-sprite-estimate'}, collisionPolygon: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]},
  }};
  assert.deepEqual(validateAnnotationDocument(document, new Set(['known'])), []);
  assert.match(validateAnnotationDocument({...document, assets: {other: document.assets.known}}, new Set(['known'])).join(' '), /Unknown asset/);
});
