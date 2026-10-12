"""Build a side-by-side style review using the exact urban reference and kit scene."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
PROJECT = ROOT.parents[2]
reference = Image.open(PROJECT / "docs/assets/pixel-art-urban-reference-clean.png").convert("RGB")
scene = Image.open(ROOT / "scene-test-v2-kit.png").convert("RGB")
# Trim the compositor's title/white margins for a fair map-area comparison.
scene = scene.crop((220, 125, 1780, 950))
W, H = 2400, 1080
board = Image.new("RGB", (W, H), (245, 244, 239))
draw = ImageDraw.Draw(board)
try:
    title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
    label = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    caption = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
except OSError:
    title = label = caption = ImageFont.load_default()

draw.text((40, 24), "COMPARAÇÃO DE ESTILO — KIT-BASE V1", font=title, fill=(42, 49, 43))
draw.text((40, 68), "A composição usa os PNGs candidatos e os tiles nativos; não roda no simulador.", font=caption, fill=(83, 88, 81))
boxes = [(32, 112, 1150, 820), (1218, 112, 1150, 820)]
for im, box in zip((reference, scene), boxes):
    im.thumbnail((box[2], box[3]), Image.Resampling.NEAREST)
    x = box[0] + (box[2] - im.width) // 2
    y = box[1] + (box[3] - im.height) // 2
    board.paste(im, (x, y))
    draw.rectangle((box[0], box[1], box[0] + box[2], box[1] + box[3]), outline=(170, 169, 158), width=1)
draw.text((32, 950), "REFERÊNCIA URBANA", font=label, fill=(42, 49, 43))
draw.text((32, 988), "Guia dominante para estilo, detalhe e densidade.", font=caption, fill=(83, 88, 81))
draw.text((1218, 950), "CENA DE TESTE ASSET-FIRST", font=label, fill=(42, 49, 43))
draw.text((1218, 988), "Tiles sem costura confirmados; densidade e acabamento ainda em curadoria.", font=caption, fill=(83, 88, 81))
board.save(ROOT / "comparativo-cena-kit-v2-referencia.png", optimize=True)
