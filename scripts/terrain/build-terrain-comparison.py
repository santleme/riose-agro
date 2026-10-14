#!/usr/bin/env python3
"""Build a truthful before/after plate for the Pixi terrain integration."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
before_path = ROOT / 'artifacts/graphics/ranch-v4-product-server.png'
after_path = ROOT / 'artifacts/graphics/ranch-v5-product-server.png'
out_path = ROOT / 'artifacts/graphics/terrain-v5-before-after.png'
for path in (before_path, after_path):
    if not path.is_file():
        raise SystemExit(f'Missing browser screenshot: {path}')

font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
margin, gap, label_h, panel_w, panel_h = 20, 16, 52, 780, 488
canvas = Image.new('RGB', (margin * 2 + panel_w * 2 + gap, margin * 2 + label_h + panel_h), '#eeede6')
draw = ImageDraw.Draw(canvas)
items = [
    (before_path, 'ANTES · TERRENO PLANO', 'Imagem de placa sem heightfield; renderer Pixi/Tiled anterior à integração V5.'),
    (after_path, 'DEPOIS · MESH COM RELEVO', 'Captura real da rota do produto; UV alinhada e heightfield ativo via Tiled.'),
]
for index, (source, title, note) in enumerate(items):
    x = margin + index * (panel_w + gap)
    draw.text((x, margin), title, font=font, fill='#293a30')
    draw.text((x, margin + 27), note, font=small, fill='#556158')
    with Image.open(source) as opened:
        image = opened.convert('RGB')
        image.thumbnail((panel_w, panel_h), Image.Resampling.LANCZOS)
        panel = Image.new('RGB', (panel_w, panel_h), '#f8f7f2')
        panel.paste(image, ((panel_w - image.width) // 2, (panel_h - image.height) // 2))
        canvas.paste(panel, (x, margin + label_h))
    draw.rectangle((x, margin + label_h, x + panel_w - 1, margin + label_h + panel_h - 1), outline='#c4c4ba')
out_path.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out_path, optimize=True)
print(out_path.relative_to(ROOT))
