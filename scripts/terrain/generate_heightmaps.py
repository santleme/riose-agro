#!/usr/bin/env python3
"""Generate three deterministic, semantically shaped terrain height fields."""
from __future__ import annotations
import argparse
import json
import math
import random
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SIZE = 129
WORLD = 14.0
STEP = 0.04
SOURCE_GROUND = ROOT / 'assets/candidates/terrain-family-v5/rural-diorama-ground-v2.png'
PASTURE_MATERIAL = ROOT / 'assets/source/terrain/rural-native-pasture-material-imagegen-v1.png'
OUT = ROOT / 'graphics-poc/generated/terrain-v5'
CANDIDATE_DIR = ROOT / 'assets/candidates/terrain-family-v7'

PROPOSALS = {
    'homestead-high-ground': {
        'label': 'Sede em espigão baixo com dois patamares e baixada úmida frontal',
        'features': [
            {'type': 'terrace', 'center': [0.43, 0.45], 'radius': [0.17, 0.14], 'height': 0.26},
            {'type': 'hill', 'center': [0.53, 0.16], 'radius': [0.25, 0.13], 'height': 0.20},
            {'type': 'basin', 'center': [0.76, 0.91], 'radius': [0.16, 0.13], 'height': -0.12},
            {'type': 'shelf', 'center': [0.82, 0.66], 'radius': [0.16, 0.19], 'height': -0.06},
        ],
        'focalRegion': 'farmhouse', 'pathConcept': 'existing dirt road rises gently to the farmhouse shoulder and drains toward the low basin',
    },
    'cross-ridge-saddle': {
        'label': 'Espigão diagonal com sela de acesso e baixada preservada',
        'features': [
            {'type': 'ridge', 'start': [0.10, 0.20], 'end': [0.83, 0.72], 'radius': 0.095, 'height': 0.30},
            {'type': 'terrace', 'center': [0.42, 0.44], 'radius': [0.14, 0.11], 'height': 0.20},
            {'type': 'hill', 'center': [0.42, 0.44], 'radius': [0.15, 0.13], 'height': 0.16},
            {'type': 'basin', 'center': [0.83, 0.90], 'radius': [0.19, 0.14], 'height': -0.10},
            {'type': 'shelf', 'center': [0.71, 0.47], 'radius': [0.18, 0.14], 'height': -0.05},
        ],
        'focalRegion': 'ridge-and-saddle', 'pathConcept': 'road crosses the ridge through a shallow saddle before entering the service yard',
    },
    'pasture-terraces': {
        'label': 'Duas pastagens em terraços baixos com canal de drenagem',
        'features': [
            {'type': 'terrace', 'center': [0.40, 0.37], 'radius': [0.32, 0.18], 'height': 0.25},
            {'type': 'terrace', 'center': [0.68, 0.18], 'radius': [0.28, 0.14], 'height': 0.18},
            {'type': 'basin', 'center': [0.78, 0.83], 'radius': [0.28, 0.16], 'height': -0.14},
            {'type': 'hill', 'center': [0.36, 0.69], 'radius': [0.18, 0.16], 'height': 0.09},
        ],
        'focalRegion': 'terraced-pasture', 'pathConcept': 'the existing road follows the natural contour and reaches a lower drainage swale',
    },
}
ROAD_CENTERLINES_PX = [
    [(404, 220), (566, 224), (715, 273), (807, 335), (869, 423), (1010, 461), (1190, 466), (1400, 455), (1668, 451)],
    [(869, 423), (765, 474), (640, 520), (510, 568), (375, 614), (277, 649)],
]

def gaussian(x: float, y: float, cx: float, cy: float, rx: float, ry: float) -> float:
    return math.exp(-0.5 * (((x-cx)/rx)**2 + ((y-cy)/ry)**2))

def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)

def distance_to_segment(x: float, y: float, a: list[float], b: list[float]) -> float:
    dx, dy = b[0]-a[0], b[1]-a[1]
    t = max(0.0, min(1.0, ((x-a[0])*dx + (y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-(a[0]+t*dx), y-(a[1]+t*dy))

def road_distance_px(x: float, y: float) -> float:
    source_x = 887.0 + (x-y) * 61.0
    source_y = 423.0 + (x+y) * 27.2
    closest = float('inf')
    for line in ROAD_CENTERLINES_PX:
        for a, b in zip(line, line[1:]):
            closest = min(closest, distance_to_segment(source_x, source_y, a, b))
    return closest

def shape_height(proposal: str, x: float, y: float, seed: int) -> float:
    value = 0.0
    for feature in PROPOSALS[proposal]['features']:
        if feature['type'] == 'ridge':
            influence = math.exp(-0.5 * (distance_to_segment(x, y, feature['start'], feature['end'])/feature['radius'])**2)
        elif feature['type'] == 'terrace':
            rx, ry = feature['radius']
            radius = math.sqrt(((x-feature['center'][0])/rx)**2 + ((y-feature['center'][1])/ry)**2)
            # Retain a broad, mostly level crown, then ease the outer shoulder
            # over 70% of the feature radius. A hard binary mask made a raised
            # island with a one-cell vertical wall in the rendered terrain.
            influence = 1.0 - smoothstep(0.30, 1.0, radius)
        else:
            rx, ry = feature['radius']
            influence = gaussian(x, y, *feature['center'], rx, ry)
        value += feature['height'] * influence
    # Very low-amplitude, seed-controlled undulation breaks planar areas without
    # making random noise the layout algorithm or creating a mountain range.
    phase = seed * 0.000137
    value += 0.012 * math.sin(x * 17.0 + phase) * math.cos(y * 13.0 - phase * 0.7)
    # Keep authored traffic corridors low and build the approach as a broad ramp.
    # This prevents a terrace escarpment from cutting through the existing road.
    distance = road_distance_px((x-0.5)*WORLD, (y-0.5)*WORLD)
    # Give road edges a broad terrain shoulder. The previous 36 px ramp caused
    # 0.12 world-unit jumps per grid sample where the road crossed a raised
    # terrace, creating a visible half-height wall alongside the access.
    t = max(0.0, min(1.0, (distance - 22.0) / 78.0))
    road_factor = t * t * (3.0 - 2.0 * t)
    value *= road_factor
    return round(max(-0.30, min(0.48, value)) / STEP) * STEP

def constrain_height_gradient(grid: list[list[float]], max_grade: float = STEP * 0.375) -> list[list[float]]:
    """Project a semantic heightfield onto a max-neighbor-slope constraint."""
    values = np.asarray(grid, dtype=np.float64).copy()
    rows, columns = values.shape
    for _ in range(512):
        changed = False
        # Forward/backward Gauss-Seidel passes propagate cuts and fills outward
        # from steep cells while preserving the pair's mean elevation.
        for row_order, col_order in ((range(rows), range(columns)), (range(rows - 1, -1, -1), range(columns - 1, -1, -1))):
            for row in row_order:
                for column in col_order:
                    for nr, nc in ((row + 1, column), (row, column + 1)):
                        if nr >= rows or nc >= columns:
                            continue
                        delta = values[nr, nc] - values[row, column]
                        excess = abs(delta) - max_grade
                        if excess > 1e-10:
                            correction = excess * 0.5 * (1.0 if delta > 0 else -1.0)
                            values[row, column] += correction
                            values[nr, nc] -= correction
                            changed = True
        if not changed:
            break
    else:
        raise RuntimeError('Heightfield grade constraint did not converge after 512 sweeps.')
    # Runtime elevation remains quantized to the configured art unit. The
    # sub-step projection ensures adjacent samples differ by at most one step.
    quantized = np.rint(values / STEP) * STEP
    quantized = np.clip(quantized, -0.30, 0.48)
    return [[round(float(value), 2) for value in row] for row in quantized]

def build_top_texture(seed: int) -> tuple[Path, list[dict]]:
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    base = Image.open(SOURCE_GROUND).convert('RGBA')
    material = Image.open(PASTURE_MATERIAL).convert('RGB').resize(base.size, Image.Resampling.LANCZOS)
    base_np = np.asarray(base).copy()
    source_rgb = base_np[..., :3].astype(np.float32)
    hsv = np.asarray(base.convert('RGB').convert('HSV'))
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    pasture_mask = ((hue >= 28) & (hue <= 115) & (saturation > 45) & (value > 35) & (base_np[..., 3] > 0))
    material_np = np.asarray(material).astype(np.float32)
    # The new art contributes micro-texture only to the existing pasture pixels;
    # the authored road and crop geometry stays anchored to the source composition.
    blend_alpha = pasture_mask[..., None].astype(np.float32) * 0.12
    base_np[..., :3] = np.clip(source_rgb * (1 - blend_alpha) + material_np * blend_alpha, 0, 255).astype(np.uint8)

    # Material grammar: apply seeded, irregular macro-zones to the authored
    # ground pixels. Source material palettes come from reviewed ground assets;
    # existing pixel detail remains visible under the color treatment. This
    # avoids stamping complete tile silhouettes into the scene.
    rng = random.Random(seed ^ 0x52494F53)
    patch_rules = [
        {'material': 'dry-pasture', 'asset': 'assets/candidates/terrain-family-v2/dry-pasture-patch-v2.png', 'radius': [1.38, 0.79], 'strength': 0.58,
         'anchors': [(-3.3, -2.9), (2.7, -3.8), (4.2, -0.9), (-4.0, 1.8)]},
        {'material': 'compacted-ground', 'asset': 'assets/candidates/terrain-family-v2/compacted-ground-patch-v2.png', 'radius': [1.02, 0.57], 'strength': 0.52,
         'anchors': [(-1.9, 2.7), (2.9, 2.8)]},
        {'material': 'muddy-ground', 'asset': 'assets/candidates/terrain-family-v2/muddy-ground-patch-v2.png', 'radius': [0.95, 0.54], 'strength': 0.6,
         'anchors': [(4.4, 3.8)]},
    ]
    material_stamps = []
    h, w = base_np.shape[:2]
    # Low-frequency, seeded value noise distorts boundaries like natural wear
    # and moisture contours without producing evenly spaced blobs.
    rng_noise = np.random.default_rng(seed ^ 0x54455252)
    noise_coarse = np.asarray(Image.fromarray(rng_noise.integers(0, 256, (18, 36), dtype=np.uint8)).resize((w, h), Image.Resampling.BICUBIC), dtype=np.float32) / 255.0
    noise_fine = np.asarray(Image.fromarray(rng_noise.integers(0, 256, (44, 88), dtype=np.uint8)).resize((w, h), Image.Resampling.BICUBIC), dtype=np.float32) / 255.0
    boundary_noise = (noise_coarse - 0.5) * 1.0 + (noise_fine - 0.5) * 0.32
    yy, xx = np.mgrid[0:h, 0:w]
    for rule in patch_rules:
        source_path = ROOT / rule['asset']
        source_full = Image.open(source_path).convert('RGBA')
        material_texture = np.asarray(source_full.crop((600, 280, 1174, 607)).convert('RGB'))
        for index, (world_x, world_y) in enumerate(rule['anchors']):
            world_x += rng.uniform(-0.32, 0.32)
            world_y += rng.uniform(-0.28, 0.28)
            center_x = 887.0 + (world_x - world_y) * 61.0
            center_y = 423.0 + (world_x + world_y) * 27.2
            radius_x = rule['radius'][0] * 61.0 * rng.uniform(0.88, 1.12)
            radius_y = rule['radius'][1] * 27.2 * rng.uniform(0.88, 1.12)
            distance = np.sqrt(((xx-center_x)/radius_x)**2 + ((yy-center_y)/radius_y)**2)
            edge = np.clip((1.05 + boundary_noise - distance) / 0.52, 0.0, 1.0)
            edge = edge * edge * (3.0 - 2.0 * edge)
            alpha = (edge * rule['strength'] * pasture_mask).astype(np.float32)[..., None]
            # Sample the real material detail in world-scaled UVs. Each patch is
            # cropped from its authored ground sprite, then clipped by the
            # irregular transition field; no complete tile silhouette is copied.
            texture_width = max(4, round(radius_x * 2))
            texture_height = max(4, round(radius_y * 2))
            texture = np.asarray(Image.fromarray(material_texture).resize((texture_width, texture_height), Image.Resampling.LANCZOS), dtype=np.float32)
            texture_x = np.clip(np.rint(xx - center_x + radius_x).astype(np.int32), 0, texture_width - 1)
            texture_y = np.clip(np.rint(yy - center_y + radius_y).astype(np.int32), 0, texture_height - 1)
            target = texture[texture_y, texture_x]
            base_np[..., :3] = np.clip(base_np[..., :3].astype(np.float32) * (1 - alpha) + target * alpha, 0, 255).astype(np.uint8)
            material_stamps.append({'material': rule['material'], 'source': rule['asset'], 'world': [round(world_x, 3), round(world_y, 3)],
                                    'radiusWorldUnits': rule['radius'], 'surfaceCenterPx': [round(center_x, 1), round(center_y, 1)],
                                    'strength': rule['strength'], 'transition': 'seeded-multiscale-organic-mask'})
    output = CANDIDATE_DIR / 'ranch-top-surface-material-v1.png'
    Image.fromarray(base_np, 'RGBA').save(output, optimize=True)
    return output, material_stamps

def build_cliff_texture() -> Path:
    """Extract a scale-matched soil strip from the authored plate side."""
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    base = Image.open(SOURCE_GROUND).convert('RGBA')
    # This front-face crop contains opaque soil pixels only, without the grass
    # lip or transparent outside of the original isometric plate.
    strip = base.crop((840, 830, 875, 839)).convert('RGB')
    strip = strip.resize((70, 36), Image.Resampling.NEAREST)
    output = CANDIDATE_DIR / 'ranch-cliff-side-material-v1.png'
    strip.save(output, optimize=True)
    return output

def generate(seed: int) -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    surface, surface_stamps = build_top_texture(seed)
    cliff_texture = build_cliff_texture()
    manifests = []
    for proposal in PROPOSALS:
        authored_grid = [[shape_height(proposal, col/(SIZE-1), row/(SIZE-1), seed) for col in range(SIZE)] for row in range(SIZE)]
        grid = constrain_height_gradient(authored_grid)
        levels = sorted({round(value, 2) for row in grid for value in row})
        item = {
            'schemaVersion': 1,
            'id': f'terrain-v5.{proposal}.seed-{seed}',
            'seed': seed,
            'proposal': proposal,
            'label': PROPOSALS[proposal]['label'],
            'focalRegion': PROPOSALS[proposal]['focalRegion'],
            'pathConcept': PROPOSALS[proposal]['pathConcept'],
            'grid': {'columns': SIZE, 'rows': SIZE, 'worldSize': [WORLD, WORLD], 'heightUnit': 'isometric-world-unit', 'metersPerWorldUnit': 5.0, 'stepWorldUnits': STEP},
            'heightLevels': levels,
            'heightmap': grid,
            'materials': {'topSurface': surface.relative_to(ROOT).as_posix(), 'cliffFace': cliff_texture.relative_to(ROOT).as_posix(), 'underside': 'deep-red-clay-review-v1',
                          'surfaceMaterialZones': surface_stamps, 'surfaceGrammar': 'pasture-ground-grammar-v1'},
            'projection': {
                'type': 'isometric-2to1',
                'sourceCanvasPx': [1774, 887],
                'sourceCenterPx': [887, 423],
                'sourceGroundPixelsPerWorldUnit': {'horizontalAxis': 61.0, 'verticalAxis': 27.2},
                'renderCanvasPx': [1774, 950],
                'renderCenterPx': [887, 470],
                'renderGroundPixelsPerWorldUnit': {'horizontalAxis': 61.0, 'verticalAxis': 30.5},
                'renderHeightPixelsPerWorldUnit': 74.7,
                'worldOrigin': 'center-of-ground-plate',
            },
            'review': {'status': 'PROPOSAL', 'art': 'pending-human-review', 'technical': 'generated-deterministically'},
        }
        path = OUT / f'{proposal}.json'
        path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + '\n')
        manifests.append({'id': item['id'], 'proposal': proposal, 'file': path.relative_to(ROOT).as_posix(),
                          'heightMin': min(levels), 'heightMax': max(levels), 'discreteLevels': len(levels), 'artReview': 'pending-human-review'})
    summary = {'schemaVersion': 1, 'generator': 'riose-terrain-heightfield-v2', 'seed': seed,
               'surfaceMaterial': surface.relative_to(ROOT).as_posix(), 'cliffMaterial': cliff_texture.relative_to(ROOT).as_posix(),
               'surfaceMaterialZones': surface_stamps, 'proposals': manifests}
    (OUT / 'proposals.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False))
    return summary

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--seed', type=int, default=84017)
    args = parser.parse_args()
    generate(args.seed)
