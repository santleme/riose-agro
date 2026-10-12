#!/usr/bin/env python3
"""Compose a static layout review from candidate PNGs; resizing is illustrative, not art approval."""
from pathlib import Path
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
# Repeated ground uses only existing PNG tiles.
grass=[Image.open(OLD/f'terrain/grass-light-03-0{i}.png').convert('RGBA') for i in (1,2,3)]
for r in range(ROWS):
 for c in range(COLS):
  x,y=center(c,r); canvas.alpha_composite(grass[(r*7+c*11)%3],(x-64,y-32))
soil=OLD/'tile-curation-v1/edge-corrected/soil-dry-01.png'
road=OLD/'roads/dirt-road-straight-02.png'
for r in range(3,8):
 for c in range(3,11): tile(soil,c,r)
for c in range(1,13): tile(road,c,6)
for r in range(3,9): tile(road,7,r)
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
# Fence/corral zones: actual candidate panels and gate; positions are review-only anchors.
for c in range(1,6): asset('fence.wood.modular.straight.ne.v1',c,2,(140,80),dy=8)
for c in range(1,6): asset('fence.wood.modular.straight.ne.v1',c,5,(140,80),dy=8,flip=True)
asset('fence.wood.gate.closed.ne.v1',3,5,(180,105),dy=2)
# Full supporting environment assets from the existing candidate library.
place(OLD/'buildings/farmhouse-small-01.png',3,2,(300,240))
place(OLD/'buildings/shed-open-01.png',10,3,(300,230))
place(OLD/'buildings/corral-module-01.png',8,5,(340,240))
place(OLD/'vehicles/tractor-01.png',10,6,(165,125))
place(OLD/'vegetation/tree-medium-01.png',1,8,(145,150))
place(OLD/'vegetation/tree-large-01.png',12,3,(175,190))
place(OLD/'water/pond-small-01.png',2,9,(240,150),dy=10)
asset('water.trough.cattle.galvanized.01',5,4,(150,95))
asset('feed.trough.supplement.wood.01',9,6,(160,96))
asset('technology.reader-station.corral-rfid-candidate.v1',11,5,(90,140))
# Three real animal-pose files and calf; small overlay candidate is intentionally visible at close zoom.
asset('livestock.nelore.adult.idle.ne.v1',3,3,(110,90))
asset('livestock.nelore.adult.walking.ne.v1',6,4,(110,100),flip=True)
asset('livestock.nelore.adult.grazing.ne.v1',10,8,(110,100))
asset('livestock.nelore.calf.idle.ne.v1',4,8,(86,75))
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
draw.text((18,9),'PILOTO PECUÁRIO V1 — CENA ESTÁTICA COM SPRITES INDIVIDUAIS',font=font,fill=(38,47,40))
draw.text((18,39),'Composição candidata com PNGs reais; revisão visual aberta; fora do runtime.',font=small,fill=(82,88,82))
# The tag is a close-inspection inset, not a world-scale device.
tag=Image.open(ROOT/A['technology.ear-tag.rfid-candidate.v1']['file']).convert('RGBA')
a=tag.getchannel('A'); b=a.point(lambda x:255 if x>=128 else 0).getbbox() or a.getbbox(); tag=tag.crop(b)
tag.thumbnail((40,40),Image.Resampling.NEAREST)
out.paste(tag,(out.width-66,14),tag)
outpath=ROOT/'assets/previews/pilot-v1/scene-candidate.png'; out.save(outpath,optimize=True); print(outpath)
