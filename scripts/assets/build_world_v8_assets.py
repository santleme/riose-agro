#!/usr/bin/env python3
"""Build the first V8 terrain sprite atlas from curated local source art."""
from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/generated/world-v8'
ATLAS = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
FRAMES: dict[str, dict] = {}


def pixelize(source: Image.Image, size: tuple[int, int], colors: int = 24) -> Image.Image:
    source = source.convert('RGBA')
    alpha = source.getchannel('A')
    rgb = source.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    result = rgb.convert('RGBA')
    result.putalpha(alpha.point(lambda value: 255 if value >= 128 else 0))
    return result.resize(size, Image.Resampling.NEAREST)


def save_frame(name: str, image: Image.Image, xy: tuple[int, int], anchor: tuple[float, float], kind: str, footprint: tuple[float, float] = (1, 1)) -> None:
    x, y = xy
    image = image.convert('RGBA')
    ATLAS.alpha_composite(image, (x, y))
    FRAMES[name] = {
        'frame': {'x': x, 'y': y, 'width': image.width, 'height': image.height},
        'anchor': {'x': anchor[0], 'y': anchor[1]},
        'kind': kind,
        'worldSize': {'width': footprint[0], 'height': footprint[1]},
        'footprint': {'width': footprint[0], 'height': footprint[1]},
        'pivot': {'x': anchor[0], 'y': anchor[1], 'space': 'normalized-sprite'},
        'collisionPolygon': [[0, 0], [footprint[0], 0], [footprint[0], footprint[1]], [0, footprint[1]]],
        'sockets': [],
        'clearance': 0.0,
    }


def source_tile(path: str) -> Image.Image:
    image = Image.open(ROOT / path).convert('RGBA')
    if image.size == (128, 64):
        return image
    return image.resize((128, 64), Image.Resampling.NEAREST)


def water_tile(phase: int) -> Image.Image:
    # The muted blue palette is sampled from the curated local pond sprite.
    source = Image.open(ROOT / 'docs/assets/kit-base-v1/water/pond-small-01.png').convert('RGBA')
    pixels = [pixel[:3] for pixel in source.getdata() if pixel[2] > pixel[0] * 1.18 and pixel[2] > pixel[1] * 1.05 and pixel[2] > 70]
    palette_image = Image.new('RGB', (len(pixels), 1))
    palette_image.putdata(pixels)
    palette = palette_image.quantize(colors=6, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    blues = sorted(set(palette.getdata()), key=lambda rgb: (rgb[2] - rgb[0], rgb[2]), reverse=True)
    deep = blues[min(1, len(blues) - 1)]
    mid = blues[min(3, len(blues) - 1)]
    light = blues[min(5, len(blues) - 1)]
    tile = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    diamond = [(64, 0), (127, 32), (64, 63), (0, 32)]
    draw.polygon(diamond, fill=mid)
    draw.line([(64, 2), (124, 32), (64, 61), (3, 32), (64, 2)], fill=deep, width=2)
    # Broad, stepped highlights stay on a stable 2 px pixel grid.
    shifts = [(18, 0), (42, 5), (71, 2)][phase % 3]
    draw.rectangle((30 + shifts[0], 27 + shifts[1], 42 + shifts[0], 29 + shifts[1]), fill=light)
    draw.rectangle((42 + shifts[0], 29 + shifts[1], 48 + shifts[0], 31 + shifts[1]), fill=light)
    draw.rectangle((77 - shifts[1], 39 - shifts[1], 87 - shifts[1], 41 - shifts[1]), fill=light)
    draw.rectangle((88 - shifts[1], 41 - shifts[1], 92 - shifts[1], 43 - shifts[1]), fill=light)
    # Hard alpha on the iso boundary avoids soft halos in nearest-neighbour rendering.
    mask = Image.new('L', tile.size, 0)
    ImageDraw.Draw(mask).polygon(diamond, fill=255)
    tile.putalpha(mask)
    return tile


def cliff_face(variant: int, direction: str) -> Image.Image:
    image = Image.new('RGBA', (80, 72), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    palette = [(96, 64, 48), (112, 73, 51), (130, 85, 57), (77, 57, 45), (148, 101, 66), (102, 77, 55)]
    # In the 2:1 projection, the +x edge slopes up-right and the +y edge
    # slopes down-right. Keep the face art aligned with the shared tile edge.
    polygon = ([(8, 32), (72, 0), (72, 40), (8, 72)] if direction == 'east'
               else [(8, 0), (72, 32), (72, 72), (8, 40)])
    draw.polygon(polygon, fill=palette[variant % len(palette)])
    rng = random.Random(8800 + variant)
    for _ in range(24):
        x, y = rng.randrange(10, 68, 2), rng.randrange(4, 68, 2)
        w, h = rng.choice((2, 4, 6)), rng.choice((2, 2, 4))
        draw.rectangle((x, y, min(70, x + w), min(70, y + h)), fill=palette[rng.randrange(len(palette))])
    for x, y in [(13, 12), (23, 45), (41, 23), (54, 56)]:
        draw.line((x, y, x + 3, y + 1, x + 5, y + 1), fill=palette[(variant + 3) % len(palette)], width=2)
    for x, y in [(13, 34), (34, 8), (49, 50)]:
        draw.line((x, y, x + 4, y), fill=palette[(variant + 4) % len(palette)], width=2)
    draw.line([polygon[0], polygon[1]], fill=(67, 57, 43), width=2)
    return image


def bridge_sprite() -> Image.Image:
    image = Image.new('RGBA', (192, 112), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Contact shadow, two abutments, deck, planks and rails form one reusable cutout.
    draw.polygon([(26, 67), (107, 32), (169, 52), (85, 91)], fill=(31, 48, 44, 92))
    draw.polygon([(30, 62), (43, 56), (49, 71), (35, 77)], fill=(97, 74, 48))
    draw.polygon([(150, 41), (163, 36), (170, 51), (156, 57)], fill=(97, 74, 48))
    deck = [(28, 55), (108, 20), (166, 42), (84, 81)]
    draw.polygon(deck, fill=(154, 105, 61))
    draw.line([deck[0], deck[1], deck[2]], fill=(209, 158, 96), width=3)
    draw.line([deck[0], deck[3], deck[2]], fill=(75, 55, 38), width=3)
    # Cross planks and pixel grain follow the bridge deck's two isometric axes.
    for index in range(1, 8):
        t = index / 8
        x1, y1 = round(28 + (108 - 28) * t), round(55 + (20 - 55) * t)
        x2, y2 = round(84 + (166 - 84) * t), round(81 + (42 - 81) * t)
        draw.line((x1, y1, x2, y2), fill=(113, 76, 48), width=2)
    for (x, y) in [(34, 51), (105, 19), (161, 41), (88, 77)]:
        draw.rectangle((x - 3, y - 7, x + 2, y + 9), fill=(75, 55, 38))
        draw.rectangle((x - 2, y - 8, x + 3, y + 5), fill=(179, 126, 73))
    draw.line((34, 46, 107, 11, 161, 34), fill=(93, 62, 41), width=4)
    draw.line((40, 54, 110, 23, 155, 42), fill=(224, 176, 111), width=3)
    draw.line((40, 54, 110, 23, 155, 42), fill=(103, 69, 43), width=1)
    draw.line((88, 75, 154, 45), fill=(103, 69, 43), width=3)
    return image


def stylized_tree() -> Image.Image:
    source = Image.open(ROOT / 'assets/approved/vegetation/shade-tree-v2.png').convert('RGBA')
    alpha = source.getchannel('A')
    bbox = alpha.getbbox()
    cropped = source.crop(bbox) if bbox else source
    small = pixelize(cropped, (72, 80), 22)
    silhouette = small.getchannel('A')
    outline = Image.new('RGBA', small.size, (43, 57, 43, 0))
    outline.putalpha(silhouette.filter(ImageFilter.MaxFilter(3)))
    outline.alpha_composite(small)
    return outline.resize((144, 160), Image.Resampling.NEAREST)


def stylized_cow_frame(state: str, index: int) -> Image.Image:
    source_path = ROOT / 'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.png'
    metadata_path = ROOT / 'assets/candidates/livestock/animation-v1/nelore-state-atlas-v1.json'
    source = Image.open(source_path).convert('RGBA')
    metadata = json.loads(metadata_path.read_text())['clips'][state]['frames'][index]
    frame = source.crop((metadata['x'], metadata['y'], metadata['x'] + metadata['width'], metadata['y'] + metadata['height']))
    alpha = frame.getchannel('A')
    bbox = alpha.getbbox()
    if bbox:
        frame = frame.crop(bbox)
    pixels = frame.load()
    for y in range(frame.height):
        for x in range(frame.width):
            red, green, blue, opacity = pixels[x, y]
            # The source atlas has bright yellow keying fringes around some
            # review frames; neutralize those edge pixels before palette work.
            if opacity and red > 180 and green > 135 and blue < 120 and red - blue > 90:
                pixels[x, y] = (226, 215, 190, opacity)
    return pixelize(frame, (64, 48), 18).resize((128, 96), Image.Resampling.NEAREST)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    grass = source_tile('docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/grass-mid-01.png')
    grass = pixelize(grass, (128, 64), 12)
    # Give adjacent grass diamonds a shared soft edge color instead of a dark tile outline.
    ImageDraw.Draw(grass).line([(64, 0), (127, 32), (64, 63), (0, 32), (64, 0)], fill=(111, 130, 80, 255), width=3)
    road_texture = pixelize(source_tile('docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/soil-dry-01.png'), (128, 64), 14)

    def path_tile(axis: str) -> Image.Image:
        mask = Image.new('L', (128, 64), 0)
        mask_draw = ImageDraw.Draw(mask)
        if axis == 'column':
            mask_draw.polygon([(49, 10), (59, -4), (140, 27), (132, 46)], fill=255)
        else:
            mask_draw.polygon([(108, 22), (134, 34), (72, 69), (55, 59)], fill=255)
        mask = ImageChops.multiply(mask, grass.getchannel('A'))
        decal = Image.new('RGBA', grass.size, (0, 0, 0, 0))
        decal.paste(road_texture, (0, 0), mask)
        result = grass.copy()
        result.alpha_composite(decal)
        return result

    road = path_tile('column')
    ramp = path_tile('row')

    save_frame('grass', grass, (0, 0), (.5, .5), 'terrain')
    save_frame('road', road, (128, 0), (.5, .5), 'road')
    save_frame('ramp', ramp, (256, 0), (.5, .5), 'ramp')
    for phase, name in enumerate(('water-0', 'water-1', 'water-2')):
        save_frame(name, water_tile(phase), (384, phase * 64), (.5, .5), 'water')
    for variant in range(4):
        # The sprite pivot sits on the upper edge midpoint, where the face
        # meets the isometric tile. This keeps each wall flush with its height.
        cliff_anchor = (.5, 16 / 72)
        save_frame(f'cliff-east-{variant}', cliff_face(variant, 'east'), (variant * 80, 192), cliff_anchor, 'cliff')
        save_frame(f'cliff-south-{variant}', cliff_face(variant, 'south'), (variant * 80, 264), cliff_anchor, 'cliff')
    save_frame('bridge', bridge_sprite(), (0, 336), (.5, .72), 'bridge', (2, 1))
    save_frame('tree', stylized_tree(), (192, 336), (.5, .92), 'vegetation', (1, 1))

    animal_clips = {}
    animal_states = {'idle': 1, 'walk': 4, 'graze': 4, 'drink': 4}
    frame_index = 0
    for state, count in animal_states.items():
        names = []
        for index in range(count):
            name = 'animal-idle' if state == 'idle' else f'animal-{state}-{index}'
            xy = ((frame_index % 4) * 128, 512 + (frame_index // 4) * 96)
            save_frame(name, stylized_cow_frame(state, index), xy, (.5, 1), 'livestock', (.6, .45))
            names.append(f'world-v8-{name}')
            frame_index += 1
        animal_clips[state] = {'frameMs': {'idle': 900, 'walk': 160, 'graze': 240, 'drink': 210}[state], 'frames': names,
                               'sourceReviewStatus': 'APPROVED_STATIC' if state == 'idle' else 'REVIEW'}

    # Atlas frames are tightly bounded; save per-frame source PNGs too for easy review and repacking.
    for name, metadata in FRAMES.items():
        frame = metadata['frame']
        image = ATLAS.crop((frame['x'], frame['y'], frame['x'] + frame['width'], frame['y'] + frame['height']))
        image.save(OUT / f'{name}.png', optimize=True)
    ATLAS.save(OUT / 'terrain-atlas-v8.png', optimize=True)
    columns, cell_w, cell_h, label_h = 3, 196, 184, 24
    names = list(FRAMES)
    contact = Image.new('RGB', (columns * cell_w, ((len(names) + columns - 1) // columns) * (cell_h + label_h)), (238, 238, 228))
    label_draw = ImageDraw.Draw(contact)
    for index, name in enumerate(names):
        frame = FRAMES[name]['frame']
        sprite = ATLAS.crop((frame['x'], frame['y'], frame['x'] + frame['width'], frame['y'] + frame['height']))
        thumb = Image.new('RGBA', (cell_w - 20, cell_h - 16), (218, 218, 208, 255))
        sprite.thumbnail((cell_w - 24, cell_h - 18), Image.Resampling.NEAREST)
        thumb.alpha_composite(sprite, ((thumb.width - sprite.width) // 2, (thumb.height - sprite.height) // 2))
        x, y = (index % columns) * cell_w + 10, (index // columns) * (cell_h + label_h) + 8
        contact.paste(thumb.convert('RGB'), (x, y))
        label_draw.text((x, y + cell_h - 4), f'{name} · {frame["width"]}×{frame["height"]}', fill=(44, 53, 44))
    contact.save(OUT / 'terrain-atlas-v8-contact.png', optimize=True)
    manifest = {
        'schemaVersion': 1,
        'atlas': 'assets/generated/world-v8/terrain-atlas-v8.png',
        'contactSheet': 'assets/generated/world-v8/terrain-atlas-v8-contact.png',
        'tileSizePx': [128, 64],
        'palette': {'grass': ['#596d43', '#718850', '#8ca05e'], 'soil': ['#563c2d', '#88583d', '#aa7650'], 'water': 'sampled from docs/assets/kit-base-v1/water/pond-small-01.png'},
        'pixelScale': 2,
        'projection': 'isometric-2-to-1',
        'assets': FRAMES,
        'animationClips': animal_clips,
        'artReview': 'pending-human-review',
        'sourceAssets': [
            'docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/grass-mid-01.png',
            'docs/assets/kit-base-v1/tile-curation-v1/edge-corrected/soil-dry-01.png',
            'docs/assets/kit-base-v1/water/pond-small-01.png',
            'assets/approved/vegetation/shade-tree-v2.png',
        ],
    }
    (OUT / 'terrain-atlas-v8.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
