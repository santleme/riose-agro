#!/usr/bin/env python3
"""Compose the terrain-family V3/V4 base and existing authored soil overlays in a ranch pilot."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
MANIFEST=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
RECORDS={a['id']:a for a in MANIFEST['assets']}
ASSETS={aid:ROOT/a['file'] for aid,a in RECORDS.items()}
def terrain(aid):
    record=RECORDS[aid]; size=record['scaleHints']['preferredRenderSizePx']
    image=Image.open(ASSETS[aid]).convert('RGBA')
    bbox=image.getchannel('A').getbbox()
    if bbox: image=image.crop(bbox)
    return image.resize((size['width'],size['height']),Image.Resampling.LANCZOS)
def sprite(aid,box):
    image=Image.open(ASSETS[aid]).convert('RGBA')
    bounds=image.getchannel('A').point(lambda v:255 if v>=32 else 0).getbbox() or image.getchannel('A').getbbox()
    image=image.crop(bounds)
    scale=min(box[0]/image.width,box[1]/image.height)
    return image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
W,H=1900,1240
canvas=Image.new('RGBA',(W,H),(247,246,241,255))
# One compact 9x9 pasture surface; terrain decals sit below all scene props.
canvas.alpha_composite(terrain('terrain.grass.pasture-base.imagegen.v4'),(374,300))
canvas.alpha_composite(terrain('terrain.road.dirt-overlay.imagegen.v2'),(520,340))
# Grounding pass: authored alpha decals sit under contact points and connect surfaces.
patch=terrain('terrain.soil.compacted-patch.imagegen.v2')
dry=terrain('terrain.soil.dry-patch.imagegen.v2')
canvas.alpha_composite(dry.resize((192,96),Image.Resampling.LANCZOS),(630,600)) # clean consolidated house approach
canvas.alpha_composite(patch.resize((200,100),Image.Resampling.LANCZOS),(1000,660)) # gate / animal traffic
canvas.alpha_composite(patch.resize((168,84),Image.Resampling.LANCZOS),(1195,710)) # tractor approach
mud=sprite('terrain.soil.mud-patch.imagegen.v2',(150,75))
canvas.alpha_composite(mud,(1040,700)) # wet wear by trough and corral edge
# Entries are ground-contact positions; sorting by Y gives an isometric painter's order.
placements=[
 ('water.pond.imagegen.v1',(500,610),(175,130)),
 ('building.farmhouse.imagegen.v2',(690,555),(340,220)),
 ('corral.wood.standard.imagegen.v1',(1000,645),(260,180)),
 ('building.shed.imagegen.v1',(1255,560),(270,210)),
 ('vegetation.tree.shade.imagegen.v1',(1370,620),(145,145)),
 ('water.trough.round.imagegen.v1',(965,720),(125,80)),
 ('feed.trough.hay.imagegen.v1',(1130,735),(150,90)),
 ('technology.monitor.station.imagegen.v1',(1450,680),(82,125)),
 ('livestock.nelore.adult.idle.imagegen.v1',(850,695),(115,95)),
 ('livestock.nelore.adult.grazing.ne.v1',(1040,730),(112,92)),
 ('livestock.nelore.calf.idle.ne.v1',(915,750),(68,58)),
 ('vehicle.tractor.imagegen.v1',(1245,790),(160,132)),
]
objects=[]
for aid,(cx,ground_y),box in placements:
    im=sprite(aid,box)
    objects.append((ground_y, im, (round(cx-im.width/2),round(ground_y-im.height))))
for _,im,pos in sorted(objects,key=lambda item:item[0]): canvas.alpha_composite(im,pos)
# Editorial labels live in the preview frame; all map art remains image assets.
d=ImageDraw.Draw(canvas)
head=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
d.text((32,24),'RIOSE — PILOTO PECUÁRIO V3 · FAMÍLIA ÚNICA DE TERRENOS',font=head,fill=(38,47,40,255))
d.text((32,56),'Cena de revisão: sede, curral, água, alimentação, gado representativo, trator e estação de monitoramento',font=small,fill=(82,88,82,255))
out=ROOT/'assets/previews/pilot-v2/ranch-pilot-terrain-v3.png';out.parent.mkdir(parents=True,exist_ok=True)
canvas.convert('RGB').save(out,optimize=True);print(out)
