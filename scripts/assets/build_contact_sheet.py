#!/usr/bin/env python3
"""Build a review contact sheet from semantic-manifest PNG sprites."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / 'assets/manifests/manifest.json').read_text())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ids', nargs='*', help='asset IDs to include; default: all manifest entries')
parser.add_argument('--output', type=Path, help='output PNG; default: assets/previews/contact-sheets/generated-library-review.png')
parser.add_argument('--columns', type=int, default=3)
args = parser.parse_args()
assets = manifest['assets']
if args.ids:
    wanted = set(args.ids)
    assets = [a for a in assets if a['id'] in wanted]
    missing = wanted - {a['id'] for a in assets}
    if missing:
        parser.error(f"unknown asset IDs: {', '.join(sorted(missing))}")
if not assets:
    parser.error('no assets selected')
if args.columns < 1:
    parser.error('--columns must be positive')

cell_w, cell_h, cols = 320, 250, args.columns
rows = (len(assets) + cols - 1) // cols
pad, label_h = 20, 34
canvas = Image.new('RGB', (pad + cols * (cell_w + pad), pad + rows * (cell_h + label_h + pad)), (244, 243, 238))
draw = ImageDraw.Draw(canvas)
font = ImageFont.load_default()

def checker(size, step=10):
    im = Image.new('RGBA', size, (235, 235, 235, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                d.rectangle((x, y, x + step - 1, y + step - 1), fill=(209, 209, 209, 255))
    return im

for idx, asset in enumerate(assets):
    row, col = divmod(idx, cols)
    x, y = pad + col * (cell_w + pad), pad + row * (cell_h + label_h + pad)
    im = Image.open(ROOT / asset['file']).convert('RGBA')
    alpha = im.getchannel('A')
    bounds = alpha.point(lambda v: 255 if v >= 128 else 0).getbbox() or alpha.getbbox()
    if bounds:
        im = im.crop(bounds)
    im.thumbnail((cell_w - 18, cell_h - 18), Image.Resampling.NEAREST)
    bg = checker((cell_w, cell_h))
    bg.alpha_composite(im, ((cell_w - im.width) // 2, (cell_h - im.height) // 2))
    canvas.paste(bg.convert('RGB'), (x, y))
    draw.text((x, y + cell_h + 4), f"{asset['id']} [{asset['status']} / {asset.get('review', {}).get('art', 'n/a')}:{asset.get('review', {}).get('technical', 'n/a')}]", fill=(35, 42, 38))

out = args.output or Path('assets/previews/contact-sheets/generated-library-review.png')
if not out.is_absolute():
    out = ROOT / out
out.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out, optimize=True)
print(out)
