#!/usr/bin/env python3
"""Build a contact sheet for every distinct sprite selected by the V8 farm scene."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / 'graphics-poc/scenes/farm-final-v8.json'
RENDER = ROOT / 'graphics-poc/assets/main-composer-render-manifest.json'
TERRAIN = ROOT / 'assets/generated/world-v8/terrain-atlas-v8.json'
OUT = ROOT / 'assets/generated/world-v8/riose-v8-selected-assets-contact.png'
PIXEL_ATLAS = ROOT / 'assets/generated/world-v8/farm-pixel-art-atlas-v1.png'


def checker(size: tuple[int, int]) -> Image.Image:
    image = Image.new('RGB', size, (228, 229, 221))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], 12):
        for x in range(0, size[0], 12):
            if (x // 12 + y // 12) % 2:
                draw.rectangle((x, y, x + 11, y + 11), fill=(214, 216, 207))
    return image


def pixelize(sprite: Image.Image) -> Image.Image:
    sprite = sprite.convert('RGBA')
    alpha = sprite.getchannel('A')
    color = ImageEnhance.Color(sprite).enhance(.82)
    small = color.resize((max(24, color.width // 2), max(24, color.height // 2)), Image.Resampling.BICUBIC)
    palette = small.convert('RGB').quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    pixel = palette.resize(sprite.size, Image.Resampling.NEAREST).convert('RGBA')
    pixel.putalpha(alpha.point(lambda value: 255 if value >= 128 else 0))
    return pixel


def main() -> None:
    scene = json.loads(SCENE.read_text())
    render = json.loads(RENDER.read_text())
    terrain = json.loads(TERRAIN.read_text())
    runtime = {asset['assetId']: asset for asset in render['assets']}
    selected = sorted({prefab['assetId'] for prefab in scene['prefabs']} | {tile['assetId'] for tile in scene['terrainTiles']})
    resolved = []
    runtime_sprites = []
    for asset_id in selected:
        if asset_id.startswith('world-v8-'):
            metadata = terrain['assets'].get(asset_id.removeprefix('world-v8-'))
            if not metadata:
                continue
            atlas_file = {'world-v8-farm-art': 'farm-art-atlas-v1.png', 'world-v8-farm-modules': 'farm-modules-atlas-v1.png', 'world-v8-water-modules': 'farm-stream-modules-atlas-v1.png'}.get(metadata.get('atlasKey'), 'terrain-atlas-v8.png')
            atlas_path = ROOT / 'assets/generated/world-v8' / atlas_file
            frame = metadata['frame']
            crop = Image.open(atlas_path).convert('RGBA').crop((frame['x'], frame['y'], frame['x'] + frame['width'], frame['y'] + frame['height']))
            status = metadata.get('reviewStatus', 'REVIEW')
        else:
            metadata = runtime.get(asset_id)
            if not metadata:
                continue
            atlas_path = ROOT / render['atlases'][metadata['atlasKey']].lstrip('/')
            frame = metadata['frame']
            crop = Image.open(atlas_path).convert('RGBA').crop((frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h']))
            status = metadata.get('reviewStatus', 'REVIEW')
            crop = pixelize(crop)
            runtime_sprites.append((asset_id, crop, metadata))
        resolved.append((asset_id, crop, status))

    # V8 uses a scene-local pixel atlas so the selected V4 art can be pixelized
    # without mutating shared assets used by the scientific and legacy scenes.
    atlas_width, margin = 2048, 8
    placed = []
    x, y, row_height = margin, margin, 0
    for asset_id, sprite, metadata in runtime_sprites:
        if x + sprite.width + margin > atlas_width:
            x, y, row_height = margin, y + row_height + margin, 0
        placed.append((asset_id, sprite, metadata, x, y))
        x += sprite.width + margin
        row_height = max(row_height, sprite.height)
    atlas_height = y + row_height + margin
    pixel_atlas = Image.new('RGBA', (atlas_width, atlas_height), (0, 0, 0, 0))
    asset_overrides = {}
    for asset_id, sprite, metadata, x, y in placed:
        pixel_atlas.alpha_composite(sprite, (x, y))
        asset_overrides[asset_id] = {'frame': {'x': x, 'y': y, 'w': sprite.width, 'h': sprite.height}, 'atlasKey': 'world-v8-farm-pixel-art'}
    PIXEL_ATLAS.parent.mkdir(parents=True, exist_ok=True)
    pixel_atlas.save(PIXEL_ATLAS, optimize=True)
    terrain['atlases']['world-v8-farm-pixel-art'] = 'assets/generated/world-v8/farm-pixel-art-atlas-v1.png'
    terrain['assetOverrides'] = asset_overrides
    TERRAIN.write_text(json.dumps(terrain, indent=2) + '\n')

    columns, cell_w, cell_h, label_h = 5, 248, 188, 38
    rows = (len(resolved) + columns - 1) // columns
    out = Image.new('RGB', (columns * cell_w, 62 + rows * (cell_h + label_h)), (242, 241, 233))
    draw = ImageDraw.Draw(out)
    draw.text((18, 16), f'RIOSE V8 - ASSETS SELECIONADOS - {len(resolved)} sprites', fill=(36, 48, 39))
    for index, (asset_id, sprite, status) in enumerate(resolved):
        x = (index % columns) * cell_w + 10
        y = 54 + (index // columns) * (cell_h + label_h)
        thumb_area = checker((cell_w - 20, cell_h))
        sprite.thumbnail((cell_w - 36, cell_h - 18), Image.Resampling.NEAREST)
        thumb_area.paste(sprite, ((thumb_area.width - sprite.width) // 2, (thumb_area.height - sprite.height) // 2), sprite)
        out.paste(thumb_area, (x, y))
        label = asset_id if len(asset_id) <= 34 else asset_id[:31] + '…'
        draw.text((x + 2, y + cell_h + 3), label, fill=(34, 46, 37))
        draw.text((x + 2, y + cell_h + 19), status, fill=(91, 98, 81))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, optimize=True)
    print(json.dumps({'output': str(OUT.relative_to(ROOT)), 'sprites': len(resolved), 'pixelizedRuntimeSprites': len(runtime_sprites), 'skipped': len(selected) - len(resolved)}, indent=2))


if __name__ == '__main__':
    main()
