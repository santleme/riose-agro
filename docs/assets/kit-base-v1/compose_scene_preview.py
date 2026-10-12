"""Compose a static review map from kit PNGs; this never runs in the simulator."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
PROJECT = ROOT.parents[2]
MANIFEST = json.loads((ROOT / "manifest-candidate-v1.json").read_text())
BY_ID = {asset["id"]: asset for asset in MANIFEST["assets"]}
W, H = 2000, 1060
ORIGIN_X, ORIGIN_Y = W // 2, 190
CELL_X, CELL_Y = 64, 32
GRID = 12
GROUND = Image.new("RGBA", (W, H), (247, 247, 244, 255))


def cell_center(col, row):
    return ORIGIN_X + (col - row) * CELL_X, ORIGIN_Y + (col + row) * CELL_Y


def paint_tile_area(asset_id, col_range, row_range):
    tile_path = PROJECT / BY_ID[asset_id]["file"]
    tile = Image.open(tile_path).convert("RGBA")
    if tile.size != (128, 64):
        raise ValueError(f"Expected native 128×64 ground tile at {tile_path}, got {tile.size}")
    for row in row_range:
        for col in col_range:
            center_x, center_y = cell_center(col, row)
            GROUND.alpha_composite(tile, (center_x - 64, center_y - 32))


def read_asset(asset_id, file_override=None):
    asset = BY_ID[asset_id]
    rel = file_override or asset.get("alphaCleanCandidateFile") or asset["file"]
    path = Path(rel)
    if not path.is_absolute():
        path = PROJECT / path
    return asset, Image.open(path).convert("RGBA")


def render_sprite(asset_id, box, file_override=None):
    """Crop only transparent padding, scale to a review footprint, return true anchor."""
    asset, source = read_asset(asset_id, file_override)
    source_size = source.size
    alpha_bounds = source.getchannel("A").getbbox()
    if not alpha_bounds:
        raise ValueError(f"Asset has no visible pixels: {asset_id}")
    image = source.crop(alpha_bounds)
    scale = min(box[0] / image.width, box[1] / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    image = image.resize(size, Image.Resampling.NEAREST)
    anchor_meta = asset.get("anchor") or {"x": 0.5, "y": 0.5}
    anchor_in_crop = (
        anchor_meta["x"] * source_size[0] - alpha_bounds[0],
        anchor_meta["y"] * source_size[1] - alpha_bounds[1],
    )
    anchor = (round(anchor_in_crop[0] * scale), round(anchor_in_crop[1] * scale))
    return image, anchor


def composite_at_anchor(dest, sprite, point):
    image, (ax, ay) = sprite
    dest.alpha_composite(image, (round(point[0] - ax), round(point[1] - ay)))


# Base pasture: 12×12 native 128×64 image tiles, placed on the 2:1 lattice.
grass_meta = BY_ID["grass-light-01"]
grass_paths = [grass_meta["file"], *grass_meta.get("randomVariants", [])]
grass_tiles = []
for rel in grass_paths:
    grass = Image.open(PROJECT / rel).convert("RGBA")
    if grass.size != (128, 64):
        raise ValueError(f"Expected native 128×64 grass tile at {rel}, got {grass.size}")
    grass_tiles.append(grass)
for row in range(GRID):
    for col in range(GRID):
        center_x, center_y = cell_center(col, row)
        grass = grass_tiles[(row * 7 + col * 11) % len(grass_tiles)]
        GROUND.alpha_composite(grass, (center_x - 64, center_y - 32))

# Compact red-earth yards connect the residence, handling area and machinery shed.
paint_tile_area("soil-dry-01", range(2, 5), range(8, 10))
paint_tile_area("soil-dry-01", range(7, 10), range(6, 9))

# A connected two-axis road network uses native image tiles, never runtime shapes.
road = Image.open(PROJECT / BY_ID["dirt-road-straight-01"]["file"]).convert("RGBA")
if road.size != (128, 64):
    raise ValueError(f"Expected native dirt-road-straight-02 tile to be 128×64, got {road.size}")
road_vertical = road.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
road_horizontal_cells = {(col, 7) for col in range(1, 11)}
road_vertical_cells = {(7, row) for row in range(4, 8)} | {(4, row) for row in range(7, 10)}
for col, row in road_horizontal_cells:
    center_x, center_y = cell_center(col, row)
    GROUND.alpha_composite(road, (center_x - 64, center_y - 32))
for col, row in road_vertical_cells:
    center_x, center_y = cell_center(col, row)
    GROUND.alpha_composite(road_vertical, (center_x - 64, center_y - 32))

# Crop plots repeat native 128×64 image tiles on the same logical lattice.
# The compositor lays out the field; the plant rows and soil detail live in PNGs.
paint_tile_area("soybean-mature-01", range(8, 12), range(0, 3))
paint_tile_area("maize-mature-01", range(8, 12), range(3, 6))

# Keep the kit's own alpha and anchor metadata. Sort by ground-contact Y for depth.
objects = []


def queue(asset_id, col, row, box, dx=0, dy=0, flip=False, flip_y=False, file_override=None):
    sprite = render_sprite(asset_id, box, file_override)
    if flip:
        sprite = (sprite[0].transpose(Image.Transpose.FLIP_LEFT_RIGHT), sprite[1])
        # Mirroring changes the horizontal anchor within the image.
        sprite = (sprite[0], (sprite[0].width - sprite[1][0], sprite[1][1]))
    if flip_y:
        sprite = (sprite[0].transpose(Image.Transpose.FLIP_TOP_BOTTOM), (sprite[1][0], sprite[0].height - sprite[1][1]))
    point = cell_center(col, row)
    point = (point[0] + dx, point[1] + dy)
    objects.append((point[1], point[0], asset_id, sprite, point))


# Farm headquarters and agricultural service yard.
for spec in [
    ("farmhouse-hq-01", 3, 8, (250, 185), 0, 0),
    ("farmhouse-small-01", 2, 9, (180, 138), -18, 8),
    ("shed-open-01", 8, 6, (245, 170), 0, 0),
    ("grain-silo-01", 10, 6, (105, 165), 0, 0),
    ("corral-module-01", 4, 3, (260, 170), 0, 0),
    ("pond-small-01", 1, 10, (190, 116), 0, 12),
    ("tractor-01", 7, 7, (128, 96), -16, 0),
    ("pickup-01", 4, 9, (120, 84), 35, 3),
    ("water-trough-01", 5, 5, (100, 56), 18, 0),
    ("feed-trough-01", 3, 4, (105, 54), 0, 0),
]:
    queue(*spec)

# Paddock cattle and a few dairy animals near the smaller support yard.
for spec in [
    ("ox-nelore-01", 3, 2, (64, 51), -34, -2),
    ("ox-nelore-01", 4, 2, (64, 51), 25, 10),
    ("ox-nelore-01", 5, 3, (62, 49), -12, 4),
    ("ox-nelore-01", 5, 4, (60, 48), 28, 5),
    ("ox-nelore-01", 6, 4, (62, 49), -25, 0),
    ("ox-nelore-01", 6, 5, (60, 48), 20, 7),
    ("ox-nelore-01", 2, 5, (60, 48), -18, 3),
    ("ox-nelore-01", 4, 6, (60, 48), 23, 6),
    ("ox-nelore-01", 7, 4, (60, 48), 5, 4),
    ("ox-nelore-01", 2, 4, (60, 48), 14, 3),
    ("ox-nelore-01", 3, 5, (60, 48), -26, 2),
    ("ox-nelore-01", 4, 5, (60, 48), 24, 4),
    ("ox-nelore-01", 5, 6, (60, 48), -9, 1),
    ("ox-nelore-01", 7, 6, (60, 48), 12, 3),
    ("ox-nelore-01", 7, 3, (60, 48), -27, 2),
    ("cow-dairy-01", 2, 7, (60, 48), -12, 0),
    ("cow-dairy-01", 3, 7, (60, 48), 31, 2),
]:
    queue(*spec)

# Outer paddock fence uses both native isometric axes; four corners use the kit corner prop.
for col in range(2, 6):
    queue("fence-straight-01", col, 1, (96, 58), dy=8)
    queue("fence-straight-01", col, 6, (96, 58), dy=8)
for row in range(2, 6):
    queue("fence-straight-01", 1, row, (96, 58), dy=8, flip_y=True)
    queue("fence-straight-01", 6, row, (96, 58), dy=8, flip_y=True)
for col, row, flip_x, flip_y in [
    (1, 1, False, False), (6, 1, True, False), (1, 6, False, True), (6, 6, True, True),
]:
    queue("fence-corner-01", col, row, (76, 58), dy=8, flip=flip_x, flip_y=flip_y)

trees = [
    ("tree-large-01", 0, 8, (130, 150)), ("tree-large-01", 1, 5, (122, 142)),
    ("tree-medium-01", 2, 4, (106, 124)), ("tree-medium-01", 1, 7, (102, 120)),
    ("tree-small-01", 2, 3, (86, 101)), ("tree-small-01", 5, 2, (86, 101)),
    ("tree-small-01", 1, 2, (86, 101)), ("tree-medium-01", 2, 1, (104, 124)),
    ("tree-small-01", 0, 4, (86, 101)), ("tree-medium-01", 3, 1, (104, 124)),
    ("tree-small-01", 5, 0, (86, 101)),
    ("tree-medium-01", 7, 3, (104, 124)),
    ("tree-large-01", 11, 6, (128, 148)), ("tree-medium-01", 11, 9, (106, 125)),
    ("tree-small-01", 0, 10, (86, 102)), ("tree-medium-01", 6, 10, (105, 125)),
    ("tree-small-01", 8, 10, (86, 101)), ("tree-medium-01", 9, 8, (102, 120)),
]
for asset_id, col, row, box in trees:
    queue(asset_id, col, row, box)

# Alpha-cleaned style refinement remains a review candidate, not a production approval.
queue("tree-medium-01", 3, 0, (102, 122), file_override="docs/assets/kit-base-v1/vegetation/tree-medium-02.png")

shrubs = [
    (0, 7), (1, 6), (2, 5), (1, 9), (2, 10), (4, 6), (5, 7), (6, 8),
    (7, 5), (8, 4), (9, 5), (10, 7), (10, 9), (8, 9), (4, 10), (6, 2),
    (1, 3), (3, 2), (4, 5), (5, 6), (6, 7), (7, 8), (8, 8), (9, 7),
    (9, 9), (3, 10), (4, 8), (7, 2), (10, 5), (2, 8),
]
for index, (col, row) in enumerate(shrubs):
    queue("shrub-01", col, row, (72, 48), (-15 if index % 2 else 13), 3)

for _, _, _, sprite, point in sorted(objects, key=lambda item: (item[0], item[1])):
    composite_at_anchor(GROUND, sprite, point)

canvas = GROUND.convert("RGB")
draw = ImageDraw.Draw(canvas)
try:
    title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 27)
    caption = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except OSError:
    title = caption = ImageFont.load_default()
draw.text((36, 23), "KIT-BASE V1 — CENA DE TESTE V2 (COMPOSIÇÃO DE ASSETS)", font=title, fill=(38, 47, 40))
draw.text((36, 59), "PNG do kit + âncoras do manifesto; estudo estático, sem mudanças no runtime.", font=caption, fill=(82, 88, 82))
canvas.save(ROOT / "scene-test-v2-kit.png", optimize=True)
