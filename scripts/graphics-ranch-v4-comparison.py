#!/usr/bin/env python3
"""Build a labeled visual comparison from the preserved old fixture and real capture."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
before = Image.open(ROOT / 'tests/fixtures/graphics-screenshots-v1/beef.png').convert('RGB')
after = Image.open(ROOT / 'artifacts/graphics/ranch-v4-canvas-after.png').convert('RGB')
out = ROOT / 'artifacts/graphics/ranch-v4-comparison.png'
font_file = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(font_file, 20)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
panel_w, panel_h, gap, margin, label_h = 780, 590, 20, 24, 66
canvas = Image.new('RGB', (margin * 2 + panel_w * 2 + gap, margin * 2 + panel_h + label_h), '#edece5')
draw = ImageDraw.Draw(canvas)
for index, (image, title, note) in enumerate(((before, 'ANTES · CAPTURA EXISTENTE', 'Canvas anterior · fundo verde · composição pequena'), (after, 'DEPOIS · PIXI + TILED', 'Canvas real · 82 objetos · 28 IDs de arte'))):
    x = margin + index * (panel_w + gap)
    draw.text((x, margin), title, font=font, fill='#26382f')
    draw.text((x, margin + 31), note, font=small, fill='#576258')
    image.thumbnail((panel_w, panel_h), Image.Resampling.LANCZOS)
    panel = Image.new('RGB', (panel_w, panel_h), '#f7f6f0')
    panel.paste(image, ((panel_w - image.width) // 2, (panel_h - image.height) // 2))
    canvas.paste(panel, (x, margin + label_h))
    draw.rectangle((x, margin + label_h, x + panel_w - 1, margin + label_h + panel_h - 1), outline='#c9c8be', width=1)
out.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out, optimize=True)
print(out.relative_to(ROOT))
