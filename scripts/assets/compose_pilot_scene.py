#!/usr/bin/env python3
"""Compose a static layout review from candidate PNGs; resizing is illustrative, not art approval."""
from pathlib import Path
import random
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
M=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
A={a['id']:a for a in M['assets']}
OLD=ROOT/'docs/assets/kit-base-v1'
W,H=(2100,1300); CELL=(128,64); ORIGIN=(1050,160); COLS,ROWS=14,12
canvas=Image.new('RGBA',(W,H),(247,246,241,255))
def center(c,r): return ORIGIN[0]+(c-r)*64, ORIGIN[1]+(c+r)*32
def tile(path,c,r):
 im=Image.open(path).convert('RGBA')
 if im.size!=(128,64): raise ValueError(f'not a native ground tile: {path} {im.size}')
 x,y=center(c,r); canvas.alpha_composite(im,(x-64,y-32))
# Repeated ground uses existing PNG tiles. A seeded shuffle avoids the obvious
# diagonal cadence from the previous arithmetic pattern while keeping the
# review scene reproducible.
grass=[Image.open(OLD/f'terrain/grass-light-03-0{i}.png').convert('RGBA') for i in (1,2,3)]
ground_rng=random.Random(2048)
for r in range(ROWS):
 for c in range(COLS):
  x,y=center(c,r); canvas.alpha_composite(ground_rng.choice(grass),(x-64,y-32))
soil=OLD/'tile-curation-v1/edge-corrected/soil-dry-01.png'
# Keep exposed soil local to the handling yard. Road sprites with incomplete
# connectors remain a single review prop; they are not repeated as tiles.
for r in range(4,7):
 for c in range(6,10): tile(soil,c,r)
objects=[]
def place(path,c,r,box,dx=0,dy=0,flip=False,anchor=None):
 src=Image.open(path).convert('RGBA'); a=src.getchannel('A')
 mask=a.point(lambda x:255 if x>=128 else 0); bounds=mask.getbbox() or a.getbbox()
 if not bounds: raise ValueError(f'empty sprite: {path}')
 im=src.crop(bounds); s=min(box[0]/im.width,box[1]/im.height); im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),Image.Resampling.NEAREST)
 if flip: im=im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
 ax=(im.width//2,im.height-2) if anchor is None else (round(anchor[0]*im.width),round(anchor[1]*im.height))
 x,y=center(c,r); point=(x+dx,y+dy); objects.append((point[1],point[0],im,ax,point))
def asset(aid,c,r,box,dx=0,dy=0,flip=False): place(ROOT/A[aid]['file'],c,r,box,dx,dy,flip)
# Compact layout: a connected farmstead, handling yard, pasture and water edge.
# Placements are review anchors, not yet production metadata.
asset('road.rural.dirt.imagegen.v1',4,10,(270,180),dy=0)
asset('water.pond.imagegen.v1',1,9,(225,145),dy=6)
asset('pasture.grass.native.imagegen.v1',3,8,(300,200),dy=0)
asset('vegetation.tree.shade.imagegen.v1',1,6,(125,140))
asset('vegetation.tree.shade.imagegen.v1',11,2,(150,165))
asset('building.farmhouse.imagegen.v2',4,2,(270,215))
asset('building.shed.imagegen.v1',10,3,(270,205))
asset('corral.wood.standard.imagegen.v1',8,5,(330,230))
asset('fence.wire.wood-post.imagegen.v1',3,5,(135,78),dy=5)
asset('fence.wire.wood-post.imagegen.v1',5,5,(135,78),dy=5)
asset('fence.gate.wood.imagegen.v1',6,5,(165,100),dy=2)
asset('vehicle.tractor.imagegen.v1',10,7,(155,118))
asset('water.trough.round.imagegen.v1',5,6,(135,86))
asset('feed.trough.hay.imagegen.v1',9,7,(145,88))
asset('technology.monitor.station.imagegen.v1',11,5,(75,118))
# Real approved/edited animal PNGs; cattle count remains a visual sample, not the simulated herd size.
asset('livestock.nelore.adult.idle.imagegen.v1',6,7,(105,86))
asset('livestock.nelore.adult.walking.ne.v1',3,9,(105,96),flip=True)
asset('livestock.nelore.adult.grazing.ne.v1',5,9,(105,96))
asset('livestock.nelore.calf.idle.ne.v1',4,8,(68,60))
for _,__,im,anchor,point in sorted(objects,key=lambda o:(o[0],o[1])):
 canvas.alpha_composite(im,(round(point[0]-anchor[0]),round(point[1]-anchor[1])))
# Crop to the actual diorama bounds to make the ranch read as one connected scene.
map_view=canvas.convert('RGB').crop((245,72,1880,945))
header=72
out=Image.new('RGB',(map_view.width, map_view.height+header),(247,246,241))
out.paste(map_view,(0,header))
draw=ImageDraw.Draw(out)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',21)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
draw.text((18,9),'PILOTO PECUÁRIO V2 — CENA ESTÁTICA COM SPRITES INDIVIDUAIS',font=font,fill=(38,47,40))
draw.text((18,39),'Composição candidata com PNGs reais; revisão visual aberta; fora do runtime.',font=small,fill=(82,88,82))
outpath=ROOT/'assets/previews/pilot-v2/scene-candidate.png'; out.save(outpath,optimize=True); print(outpath)
