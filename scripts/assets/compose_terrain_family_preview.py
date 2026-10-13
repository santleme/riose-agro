#!/usr/bin/env python3
"""Build a terrain family scene preview from manifested image assets only."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
M=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
RECORDS={a['id']:a for a in M['assets']}
A={aid:ROOT/a['file'] for aid,a in RECORDS.items()}
def terrain_sprite(asset_id):
    hints=RECORDS[asset_id].get('scaleHints')
    if not hints:
        raise ValueError(f'{asset_id} has no preferred terrain scaleHints')
    size=hints['preferredRenderSizePx']
    return Image.open(A[asset_id]).convert('RGBA').resize((size['width'],size['height']),Image.Resampling.LANCZOS)
canvas=Image.new('RGBA',(1500,1000),(247,246,241,255))
ground=terrain_sprite('pasture.grass.premium.imagegen.v1')
canvas.alpha_composite(ground,(175,260))
road=terrain_sprite('terrain.road.dirt-overlay.imagegen.v2')
canvas.alpha_composite(road,(510,445))
patch=terrain_sprite('terrain.soil.compacted-patch.imagegen.v2')
canvas.alpha_composite(patch,(650,555))
canvas.alpha_composite(patch.resize((224,112),Image.Resampling.LANCZOS),(950,520))
def sprite(asset_id,box):
 im=Image.open(A[asset_id]).convert('RGBA')
 bounds=im.getchannel('A').point(lambda v:255 if v>=32 else 0).getbbox() or im.getchannel('A').getbbox()
 im=im.crop(bounds); scale=min(box[0]/im.width,box[1]/im.height)
 return im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
placements=[
 ('building.farmhouse.imagegen.v2',(470,545),(410,245)),
 ('vegetation.tree.shade.imagegen.v1',(1070,485),(160,150)),
 ('vehicle.tractor.imagegen.v1',(1000,640),(205,180)),
 ('livestock.nelore.adult.idle.imagegen.v1',(740,665),(180,160)),
]
objects=[]
for aid,(cx,cy),box in placements:
 im=sprite(aid,box);objects.append((cy,im,(cx-im.width//2,cy-im.height+20)))
for _,im,pos in sorted(objects,key=lambda x:x[0]):canvas.alpha_composite(im,pos)
d=ImageDraw.Draw(canvas)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
d.text((32,22),'RIOSE — TERRENO V2: TRANSIÇÃO + GROUNDING',font=font,fill=(38,47,40,255))
d.text((32,53),'Assets reais sobre o pasto refinado • estrada com borda irregular • áreas de uso localizadas',font=small,fill=(82,88,82,255))
out=ROOT/'assets/previews/calibration-v2/terrain-family-v2-scene.png'
out.parent.mkdir(parents=True,exist_ok=True);canvas.convert('RGB').save(out,optimize=True)
print(out)
