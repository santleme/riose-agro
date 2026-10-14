#!/usr/bin/env python3
"""Assemble the three browser captures for visual layout comparison."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / 'graphics-poc/generated/terrain-v5/composition-proposals/proposals.json').read_text())
items = [
    ('terrain-homestead-hub', 'Sede central', 'Referência: mantém o hub, serviços a leste e manejo frontal.'),
    ('terrain-service-corridor', 'Corredor de serviço', 'Compacta serviço, água e manejo em torno do eixo de circulação.'),
    ('terrain-north-yard', 'Pátio ao norte', 'Move a sede para o ombro norte e aproxima o pátio da estrada central.'),
]
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 19)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
panel_w, panel_h, margin, gap, label_h = 610, 346, 18, 14, 58
canvas = Image.new('RGB', (margin * 2 + panel_w * 3 + gap * 2, margin * 2 + label_h + panel_h), '#eeede6')
draw = ImageDraw.Draw(canvas)
for index, (name, title, note) in enumerate(items):
    x = margin + index * (panel_w + gap)
    draw.text((x, margin), title, font=font, fill='#293a30')
    draw.text((x, margin + 29), note, font=small, fill='#556158')
    source = ROOT / f'artifacts/graphics/{name}-canvas-after.png'
    if not source.is_file(): raise SystemExit(f'Missing proposal browser capture: {source}')
    with Image.open(source) as opened:
        image = opened.convert('RGB')
        image.thumbnail((panel_w, panel_h), Image.Resampling.LANCZOS)
        panel = Image.new('RGB', (panel_w, panel_h), '#f8f7f2')
        panel.paste(image, ((panel_w - image.width) // 2, (panel_h - image.height) // 2))
        canvas.paste(panel, (x, margin + label_h))
    draw.rectangle((x, margin + label_h, x + panel_w - 1, margin + label_h + panel_h - 1), outline='#c4c4ba')
out = ROOT / 'artifacts/graphics/terrain-v5-composition-proposals.png'
out.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out, optimize=True)
print(out.relative_to(ROOT))
