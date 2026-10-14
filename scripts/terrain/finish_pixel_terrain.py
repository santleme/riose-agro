#!/usr/bin/env python3
"""Preserve transparency and normalize Blender terrain renders to a restrained palette."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / 'graphics-poc/generated/terrain-v5'
summary = json.loads((DIR / 'proposals.json').read_text())
proposals = summary['proposals']
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
items = []
for entry in proposals:
    source = DIR / f"{entry['proposal']}-render.png"
    output = DIR / f"{entry['proposal']}.png"
    with Image.open(source) as raw:
        image = raw.convert('RGBA')
        alpha = image.getchannel('A')
        indexed = image.convert('RGB').quantize(colors=192, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        finished = indexed.convert('RGB'); finished.putalpha(alpha)
        finished.save(output, optimize=True)
        items.append({'id': entry['id'], 'source': source.relative_to(ROOT).as_posix(), 'file': output.relative_to(ROOT).as_posix(),
                      'dimensions': list(finished.size), 'alphaPreserved': True, 'paletteLimit': 192, 'status': 'PROPOSAL'})

panel_w, panel_h, title_h, gap = 650, 360, 58, 18
board = Image.new('RGB', (panel_w * 3 + gap * 4, panel_h + title_h + gap * 2), '#eeede6')
draw = ImageDraw.Draw(board)
for index, entry in enumerate(proposals):
    x = gap + index * (panel_w + gap)
    title = entry['proposal'].replace('-', ' ').title()
    draw.text((x, gap), title, font=font, fill='#28392f')
    with Image.open(DIR / f"{entry['proposal']}.png") as img:
        img = img.convert('RGBA'); img.thumbnail((panel_w - 10, panel_h - 10), Image.Resampling.LANCZOS)
        bg = Image.new('RGBA', (panel_w, panel_h), '#f6f5ef')
        bg.alpha_composite(img, ((panel_w-img.width)//2, (panel_h-img.height)//2))
        board.paste(bg.convert('RGB'), (x, gap + title_h))
board_path = DIR / f"terrain-proposal-board-seed-{summary['seed']}.png"
board.save(board_path, optimize=True)
(DIR / 'render-manifest.json').write_text(json.dumps({'schemaVersion': 1, 'generator': 'Blender 4.0.2 Cycles CPU + Pillow palette normalization',
    'projection': 'isometric 2:1', 'seed': summary['seed'], 'artReview': 'pending-human-review', 'proposals': items, 'board': board_path.relative_to(ROOT).as_posix()}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'proposals': items, 'board': board_path.relative_to(ROOT).as_posix()}, ensure_ascii=False))
