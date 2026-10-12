"""Create a checkerboard contact sheet for category-level candidate atlas review."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
ATLAS_DIR = ROOT / "atlas-candidate-v1"
files = sorted(ATLAS_DIR.glob("*.png"))
cols, rows = 3, (len(files) + 2) // 3
panel_w, panel_h = 650, 430
header_h = 105
sheet = Image.new("RGB", (cols * panel_w, header_h + rows * panel_h), (245, 244, 239))
draw = ImageDraw.Draw(sheet)
try:
    title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
    label = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 19)
    caption = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except OSError:
    title = label = caption = ImageFont.load_default()
draw.text((32, 20), "ATLAS CANDIDATOS V1 — REVISÃO DE FRAMES", font=title, fill=(42, 49, 43))
draw.text((32, 63), "Transparência real; sem reamostragem; atlas de revisão não conectado ao runtime.", font=caption, fill=(83, 88, 81))

for index, path in enumerate(files):
    col, row = index % cols, index // cols
    x0, y0 = col * panel_w, header_h + row * panel_h
    draw.rectangle((x0 + 8, y0 + 8, x0 + panel_w - 8, y0 + panel_h - 8), fill=(255, 255, 255), outline=(180, 179, 169), width=1)
    # Checkerboard shows the atlas alpha without baking a matte into the source.
    checker = Image.new("RGB", (panel_w - 20, panel_h - 80), (0, 0, 0))
    cd = ImageDraw.Draw(checker)
    size = 18
    for yy in range(0, checker.height, size):
        for xx in range(0, checker.width, size):
            if (xx // size + yy // size) % 2:
                cd.rectangle((xx, yy, xx + size - 1, yy + size - 1), fill=(220, 222, 218))
            else:
                cd.rectangle((xx, yy, xx + size - 1, yy + size - 1), fill=(241, 242, 239))
    atlas = Image.open(path).convert("RGBA")
    atlas.thumbnail(checker.size, Image.Resampling.NEAREST)
    checker_rgba = checker.convert("RGBA")
    checker_rgba.alpha_composite(atlas, ((checker.width - atlas.width) // 2, (checker.height - atlas.height) // 2))
    sheet.paste(checker_rgba.convert("RGB"), (x0 + 10, y0 + 10))
    draw.text((x0 + 18, y0 + panel_h - 57), path.stem, font=label, fill=(42, 49, 43))
    im = Image.open(path)
    draw.text((x0 + 18, y0 + panel_h - 31), f"{im.width}×{im.height}px", font=caption, fill=(83, 88, 81))

sheet.save(ROOT / "review-atlases-candidate-v1.png", optimize=True)
