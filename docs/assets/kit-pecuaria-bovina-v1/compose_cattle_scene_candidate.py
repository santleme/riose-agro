"""Static asset-first cattle scene composer using existing PNG candidates only."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
KIT = Path(__file__).resolve().parent
OLD = ROOT / "docs/assets/kit-base-v1"
manifest = json.loads((OLD / "manifest-candidate-v1.json").read_text())
by_id = {a["id"]: a for a in manifest["assets"]}
W, H, ORIGIN, CELL, COLS, ROWS = 2000, 1180, (1000, 170), (64, 32), 14, 12
canvas = Image.new("RGBA", (W, H), (247, 247, 244, 255))


def center(c, r):
    return ORIGIN[0] + (c-r)*CELL[0], ORIGIN[1] + (c+r)*CELL[1]


def put_tile(path, c, r):
    im = Image.open(path).convert("RGBA")
    if im.size != (128, 64):
        raise ValueError(f"Expected 128x64 tile: {path} {im.size}")
    x, y = center(c, r)
    canvas.alpha_composite(im, (x-64, y-32))


def tile_area(path, cols, rows):
    for r in rows:
        for c in cols:
            put_tile(path, c, r)


objects = []


def queue(asset_id, c, r, box, dx=0, dy=0, flip_x=False, flip_y=False):
    meta = by_id[asset_id]
    src = Image.open(ROOT / meta["file"]).convert("RGBA")
    original = src.size
    bounds = src.getchannel("A").getbbox()
    if not bounds:
        raise ValueError(f"Empty sprite: {asset_id}")
    im = src.crop(bounds)
    scale = min(box[0]/im.width, box[1]/im.height)
    im = im.resize((max(1, round(im.width*scale)), max(1, round(im.height*scale))), Image.Resampling.NEAREST)
    anchor = (round((meta["anchor"]["x"]*original[0]-bounds[0])*scale),
              round((meta["anchor"]["y"]*original[1]-bounds[1])*scale))
    if flip_x:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        anchor = (im.width-anchor[0], anchor[1])
    if flip_y:
        im = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        anchor = (anchor[0], im.height-anchor[1])
    x, y = center(c, r)
    point = (x+dx, y+dy)
    objects.append((point[1], point[0], im, anchor, point))


# The entire ground is tiled from the existing native grass PNG variants.
grass = [Image.open(OLD / f"terrain/grass-light-03-0{i}.png").convert("RGBA") for i in (1, 2, 3)]
for r in range(ROWS):
    for c in range(COLS):
        x, y = center(c, r)
        canvas.alpha_composite(grass[(r*7+c*11) % len(grass)], (x-64, y-32))

# Pasture states, handling yard, and the connecting road use candidate ground PNGs.
mid = OLD / "tile-curation-v1/edge-corrected/grass-mid-01.png"
soil = OLD / "tile-curation-v1/edge-corrected/soil-dry-01.png"
tile_area(mid, range(1, 6), range(1, 5))
tile_area(mid, range(8, 13), range(7, 11))
tile_area(mid, range(2, 6), range(7, 10))
tile_area(soil, range(6, 10), range(4, 7))
road = Image.open(OLD / "roads/dirt-road-straight-02.png").convert("RGBA")
for c, r in [(c, 5) for c in range(2, 12)] + [(7, r) for r in range(3, 8)]:
    x, y = center(c, r)
    canvas.alpha_composite(road, (x-64, y-32))

# Fence lines are assembled from PNG segments, not drawn as runtime geometry.
for c in range(1, 7):
    queue("fence-straight-01", c, 1, (160, 96), dy=6)
    queue("fence-straight-01", c, 5, (160, 96), dy=6, flip_y=True)
for r in range(2, 5):
    queue("fence-straight-01", 1, r, (160, 96), dy=6, flip_x=True)
    queue("fence-straight-01", 7, r, (160, 96), dy=6)
for c in range(8, 14):
    queue("fence-straight-01", c, 7, (160, 96), dy=6)
    queue("fence-straight-01", c, 11, (160, 96), dy=6, flip_y=True)
for r in range(8, 11):
    queue("fence-straight-01", 8, r, (160, 96), dy=6, flip_x=True)
    queue("fence-straight-01", 13, r, (160, 96), dy=6)
for c, r in [(1,1),(7,1),(1,5),(7,5),(8,7),(13,7),(8,11),(13,11)]:
    queue("fence-corner-01", c, r, (128, 108), dy=6)

# Farmstead, support shed, corral, water/feed, and unbranded farm vehicles.
for spec in [
    ("farmhouse-hq-01",3,3,(320,235),0,0),
    ("shed-open-01",10,3,(330,220),0,0),
    ("corral-module-01",8,6,(410,280),0,0),
    ("pond-small-01",1,9,(245,160),0,10),
    ("water-trough-01",5,4,(142,96),26,0),
    ("water-trough-01",11,9,(142,96),-15,0),
    ("feed-trough-01",7,7,(150,92),4,0),
    ("pickup-01",4,4,(170,118),90,0),
    ("tractor-01",10,4,(172,126),4,0)
]:
    queue(*spec)

# Nelore groups in three pasture/handling zones.
cattle = [(2,2,-24,2),(4,2,28,5),(6,3,-8,0),(2,4,16,2),(4,4,34,1),(6,4,-18,3),
          (9,8,-16,2),(11,8,22,4),(12,9,-28,1),(9,10,18,3),(11,10,35,1),(13,9,-8,4),
          (2,8,-16,3),(4,8,25,2),(6,9,-22,4),(3,10,33,1),(5,10,12,2),
          (7,5,-20,1),(8,5,22,3),(9,6,-18,1),(8,7,26,3),(10,6,5,4)]
for i, (c,r,dx,dy) in enumerate(cattle):
    queue("ox-nelore-01",c,r,(96,78),dx,dy,flip_x=(i%2==1))

trees = [(0,3,"tree-large-01",(172,190)),(1,6,"tree-medium-01",(140,158)),
         (4,1,"tree-medium-01",(140,158)),(6,2,"tree-small-01",(112,128)),
         (12,3,"tree-large-01",(172,190)),(13,7,"tree-medium-01",(140,158)),
         (6,9,"tree-small-01",(112,128)),(12,10,"tree-medium-01",(140,158)),
         (1,11,"tree-small-01",(112,128)),(5,10,"tree-medium-01",(140,158)),
         (8,2,"tree-small-01",(112,128)),(11,5,"tree-medium-01",(140,158))]
for c,r,asset_id,box in trees:
    queue(asset_id,c,r,box)
for i,(c,r) in enumerate([(0,8),(1,8),(2,9),(2,10),(12,6),(11,6),(6,3),(7,3),(6,8),(7,9),(5,6),(10,10)]):
    queue("shrub-01",c,r,(90,62),dx=(i%2)*16,dy=2)

for _,_,im,anchor,point in sorted(objects,key=lambda o:(o[0],o[1])):
    canvas.alpha_composite(im,(round(point[0]-anchor[0]),round(point[1]-anchor[1])))

result = canvas.convert("RGB")
draw = ImageDraw.Draw(result)
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",25)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",15)
draw.text((36,24),"CATTLE V1 — MAPA DE REVISÃO COM SPRITES CANDIDATOS",font=font,fill=(38,47,40))
draw.text((36,59),"Composição estática asset-first; pastos, curral, água, cercas e rebanho. Fora do runtime.",font=small,fill=(82,88,82))
out = ROOT / "docs/assets/review-cattle-pixel/composicao-modular-kit-legado-v1.png"
result.save(out,optimize=True)
print(out)

