"""Author 128x64 pixel-art utility tile candidates directly on their native grid."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
W,H=128,64

def mask_diamond():
    im=Image.new('RGBA',(W,H),(0,0,0,0)); p=im.load()
    for y in range(H):
        for x in range(W):
            if abs((x+.5)-64)/64 + abs((y+.5)-32)/32 <= 1+1e-9:
                p[x,y]=(1,1,1,255)
    return im

def tile(base, clusters=()):
    m=mask_diamond(); out=Image.new('RGBA',(W,H),(0,0,0,0)); p=out.load(); mask=m.getchannel('A').load()
    for y in range(H):
        for x in range(W):
            if mask[x,y]: p[x,y]=(*base,255)
    for x,y,color in clusters:
        if 0<=x<W and 0<=y<H and mask[x,y]: p[x,y]=(*color,255)
    return out

def add_cluster(im, x, y, pixels, color):
    p=im.load(); mask=mask_diamond().getchannel('A').load()
    for dx,dy in pixels:
        xx,yy=x+dx,y+dy
        if 0<=xx<W and 0<=yy<H and mask[xx,yy]: p[xx,yy]=(*color,255)

def save(name,im):
    p=ROOT/name; p.parent.mkdir(parents=True,exist_ok=True); im.save(p,optimize=True); return im

# Grass family: flat bases and restrained, deliberate clusters away from joins.
grass_clusters=[
 (14,28,[(0,1),(1,1),(1,0),(2,0),(2,1)],(69,91,62)),
 (28,20,[(0,1),(1,0),(1,1),(2,1)],(132,153,98)),
 (43,39,[(0,1),(1,1),(1,0),(2,0),(2,1)],(69,91,62)),
 (55,23,[(0,1),(1,1),(1,0),(2,0)],(100,123,77)),
 (72,42,[(0,1),(1,1),(1,0),(2,0),(2,1)],(69,91,62)),
 (84,17,[(0,1),(1,1),(1,0),(2,0)],(132,153,98)),
 (98,33,[(0,1),(1,1),(1,0),(2,0),(2,1)],(69,91,62)),
 (108,24,[(0,1),(1,1),(1,0),(2,0)],(100,123,77)),
]
im=tile((115,139,89))
for x,y,pix,col in grass_clusters: add_cluster(im,x,y,pix,col)
save('terrain/grass-light-02.png',im)
# Three denser pastures for map-scale composition. They are authored directly
# at 128×64, with stepped pixel clusters and a clean, flat perimeter band.
def detailed_grass_variant(variant):
    out=tile((115,139,89))
    patterns=[
      [(15,28),(29,19),(43,40),(55,24),(72,43),(84,17),(98,34),(109,24),(37,51),(88,51),(61,46),(21,41)],
      [(19,35),(34,24),(49,47),(65,19),(77,36),(93,24),(105,42),(47,30),(27,49),(81,53),(60,38),(99,51)],
      [(13,39),(25,24),(42,31),(56,49),(70,25),(87,40),(102,20),(111,34),(35,47),(76,51),(58,34),(94,50)],
    ][variant]
    dark=[(69,91,62),(77,99,64),(63,86,58)][variant]
    mid=[(132,153,98),(126,148,94),(137,157,101)][variant]
    light=[(157,174,111),(151,169,107),(163,179,116)][variant]
    shadow=[(82,105,66),(78,101,64),(87,108,68)][variant]
    for i,(x,y) in enumerate(patterns):
        add_cluster(out,x,y,[(0,2),(1,1),(1,2),(2,0),(2,1),(2,2),(3,2)],dark)
        add_cluster(out,x+2,y+1,[(0,0),(1,0),(1,1),(2,1)],mid)
        add_cluster(out,x+3,y,[(0,0),(1,0)],light)
        if i%3==0:
            add_cluster(out,x-1,y+3,[(0,0),(1,0),(2,0)],shadow)
        if i%4==1:
            add_cluster(out,x+4,y+2,[(0,0),(1,0)],(174,148,91))
    return out

grass_variants=[]
for variant in range(3):
    grass_variants.append(detailed_grass_variant(variant))
    save(f'terrain/grass-light-03-{variant+1:02d}.png',grass_variants[-1])
im=tile((96,119,76))
for x,y,pix,col in grass_clusters: add_cluster(im,x,y,pix,(87,108,69) if col==(69,91,62) else ((119,141,86) if col==(132,153,98) else (105,128,78)))
save('terrain/grass-mid-02.png',im)
# Dry soil is a solid field tile with a few crisp earth clusters.
im=tile((151,103,68))
for x,y,pix,col in [
 (17,28,[(0,1),(1,1),(1,0),(2,0)],(124,81,57)),(31,20,[(0,1),(1,1),(1,0)],(174,123,81)),
 (45,40,[(0,1),(1,1),(1,0),(2,0)],(124,81,57)),(59,24,[(0,1),(1,1),(1,0)],(174,123,81)),
 (76,43,[(0,1),(1,1),(1,0),(2,0)],(124,81,57)),(89,18,[(0,1),(1,1),(1,0)],(174,123,81)),
 (104,34,[(0,1),(1,1),(1,0),(2,0)],(124,81,57))]: add_cluster(im,x,y,pix,col)
save('terrain/soil-dry-02.png',im)

# Straight road tile: the road goes through matching 2:1 side connectors.
def road_tile(corner=False):
    out=tile((115,139,89)); d=ImageDraw.Draw(out)
    if not corner:
        path=[(32,16),(64,32),(96,48)]
    else:
        path=[(32,16),(48,22),(64,32),(80,22),(96,16)]
    # Pixel-native nested bands: subtle shoulder, compacted earth, narrow wheel tone.
    d.line(path,fill=(113,79,57,255),width=22,joint='curve')
    d.line(path,fill=(157,108,72,255),width=18,joint='curve')
    d.line(path,fill=(174,123,82,255),width=10,joint='curve')
    # Restore transparent exterior and flat diamond edges; no perimeter contour.
    m=mask_diamond().getchannel('A').load(); px=out.load()
    for y in range(H):
        for x in range(W):
            if not m[x,y]: px[x,y]=(0,0,0,0)
    # Modest grassy tufts stay away from the road and the tile edge.
    for x,y in [(12,35),(26,43),(39,12),(84,54),(103,29),(113,41)]:
        add_cluster(out,x,y,[(0,1),(1,1),(1,0),(2,0)],(67,89,61))
    return out
save('roads/dirt-road-straight-02.png',road_tile(False))
save('roads/dirt-road-turn-02.png',road_tile(True))

# Crop tiles use a global repeating row phase so both isometric lattice vectors align.
def crop_tile(kind):
    palettes={
      'soybean-emerging':((139,91,61),(157,105,68),(73,102,59),(117,147,72),(48,76,48)),
      'soybean-mature':((132,86,58),(151,101,64),(53,91,49),(91,132,59),(39,67,43)),
      'maize-growing':((137,91,61),(156,105,68),(54,105,57),(92,143,66),(42,76,45)),
      'maize-mature':((133,87,58),(153,102,64),(50,97,51),(91,139,59),(199,157,65)),
    }
    base,furrow,leaf,light,accent=palettes[kind]
    out=tile(base); p=out.load(); mask=mask_diamond().getchannel('A').load()
    # Furrow marks follow the same slope and repeat on both 2:1 neighbor axes.
    for y in range(H):
      for x in range(W):
        if not mask[x,y]: continue
        d=2*y-x
        if d%32 in (0,1): p[x,y]=(*furrow,255)
    # Crop plants: intentional clusters on a 16-pixel periodic phase. Translation
    # by either isometric neighbor vector (64,+/-32) preserves the pattern.
    t_values=range(-96,257,16)
    d_values=(-48,-16,16,48)
    for dv in d_values:
      for tv in t_values:
        if (tv+dv)%4: continue
        x=(tv-dv)//2; y=(tv+dv)//4
        if not (5<=x<W-5 and 5<=y<H-5): continue
        if kind=='soybean-emerging':
          shadow=[(-1,1),(0,1),(1,0),(2,0),(2,1),(1,2)]
          shape=[(-1,0),(0,0),(1,-1),(2,-1),(0,1),(1,1)]
        elif kind=='soybean-mature':
          shadow=[(0,0),(1,-1),(2,-1),(3,0),(2,1),(1,2),(0,3),(-1,2),(-2,1),(-1,0)]
          shape=[(0,0),(1,-1),(2,-1),(2,0),(1,1),(0,2),(-1,1),(-1,0)]
        elif kind=='maize-growing':
          shadow=[(0,-3),(0,-2),(0,-1),(0,0),(-3,0),(-2,1),(-1,1),(1,1),(2,2),(3,2)]
          shape=[(0,-3),(0,-2),(0,-1),(0,0),(-2,0),(-1,1),(1,0),(2,1),(3,2)]
        else:
          shadow=[(0,-6),(0,-5),(0,-4),(0,-3),(0,-2),(0,-1),(0,0),(-4,0),(-3,1),(-2,1),(-1,1),(1,1),(2,1),(3,2),(4,2)]
          shape=[(0,-6),(0,-5),(0,-4),(0,-3),(0,-2),(0,-1),(0,0),(-3,0),(-2,1),(-1,1),(1,0),(2,1),(3,2)]
        add_cluster(out,x,y,shadow,(39,67,43) if kind in ('soybean-mature','maize-mature') else (48,76,48))
        add_cluster(out,x,y,shape,leaf)
        highlights=[(0,-1),(1,0),(2,0),(-1,1)]
        if kind in ('soybean-mature','maize-growing','maize-mature'):
          add_cluster(out,x,y,highlights,light)
        if kind=='maize-mature':
          add_cluster(out,x,y,[(0,-6),(1,-6)],accent)
    return out

for kind in ('soybean-emerging','soybean-mature','maize-growing','maize-mature'):
    save(f'agriculture/{kind}-02.png',crop_tile(kind))

# Composite repeat previews; all tile pixels remain at native logical scale.
def repeat_preview(name, tiles, outname):
    canvas=Image.new('RGBA',(128*3,64*3),(45,48,42,255))
    for row in range(3):
      for col in range(3):
        im=tiles[(row+col)%len(tiles)]
        canvas.alpha_composite(im,((col-row)*64+128,(col+row)*32))
    canvas.resize((128*9,64*9),Image.Resampling.NEAREST).save(ROOT/outname,optimize=True)

for tile_name in ('grass-light-02','grass-mid-02','soil-dry-02','dirt-road-straight-02','dirt-road-turn-02','soybean-emerging-02','soybean-mature-02','maize-growing-02','maize-mature-02'):
    folder='roads' if tile_name.startswith('dirt-road') else ('agriculture' if tile_name.startswith(('soybean','maize')) else 'terrain')
    im=Image.open(ROOT/folder/f'{tile_name}.png').convert('RGBA')
    assert im.size==(128,64)
    assert set(im.getchannel('A').getdata()) <= {0,255}
    repeat_preview(tile_name,[im],f'tile-preview-{tile_name}-3x3.png')
repeat_preview('grass-light-03',grass_variants,'tile-preview-grass-light-03-3x3.png')
print('authored native-grid tiles and 3×3 previews, including 3 detailed pasture variants')
