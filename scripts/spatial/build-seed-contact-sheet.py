#!/usr/bin/env python3
"""Build a labeled browser-capture sheet for generated V6 layout variants."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "artifacts/graphics/spatial-assembly-v6"
SCENES = [
    ("Corte · seed 84018", "compiled-beef-84018.json", "macro-assembly-cpsat-beef-seed-84018.png"),
    ("Corte · seed 84019", "compiled-beef-84019.json", "macro-assembly-cpsat-beef-seed-84019.png"),
    ("Corte · seed 84020", "compiled-beef-84020.json", "macro-assembly-cpsat-beef-seed-84020.png"),
    ("Leiteira · seed 84018", "compiled-dairy-84018.json", "macro-assembly-cpsat-dairy-seed-84018.png"),
]
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
tile_w, tile_h = 800, 485
sheet = Image.new("RGB", (tile_w * 2, tile_h * 2 + 78), "#1d2823")
draw = ImageDraw.Draw(sheet)
draw.text((24, 18), "RIOSE · V6 semantic assembly variants", font=font, fill="#f0e6ca")

for index, (label, scene_file, capture_file) in enumerate(SCENES):
    scene = json.loads((ARTIFACTS / scene_file).read_text())
    capture = Image.open(ARTIFACTS / capture_file).convert("RGB")
    capture = capture.crop((0, 70, min(capture.width, 1270), capture.height))
    capture.thumbnail((tile_w - 28, tile_h - 105), Image.Resampling.LANCZOS)
    x, y = (index % 2) * tile_w, 58 + (index // 2) * tile_h
    draw.rectangle((x + 5, y + 5, x + tile_w - 5, y + tile_h - 5), fill="#28352f", outline="#778575", width=2)
    draw.text((x + 18, y + 14), label, font=font, fill="#f0e6ca")
    summary = f"{len(scene['placements'])} estruturas · {len(scene['paddocks'])} piquetes · {len(scene['roadPaths'])} rotas"
    draw.text((x + 18, y + 45), summary, font=small, fill="#bfd0b6")
    image_x = x + (tile_w - capture.width) // 2
    sheet.paste(capture, (image_x, y + 72))

output = ARTIFACTS / "scene-variants-contact-sheet.png"
sheet.save(output)
print(json.dumps({"output": str(output.relative_to(ROOT)), "scenes": [label for label, _, _ in SCENES]}))
