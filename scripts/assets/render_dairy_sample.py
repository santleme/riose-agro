#!/usr/bin/env python3
"""Compose a compact dairy-farm sample from generated sprites and shared core assets."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
PRE=ROOT/'assets/modules/livestock-dairy/previews'
PRE.mkdir(parents=True,exist_ok=True)
core=json.loads((ROOT/'public/assets/manifest.json').read_text())
core_assets={a['id']:a for a in core['assets']}
mod=json.loads((ROOT/'public/assets/modules/livestock-dairy/manifest.json').read_text())
mod_assets={a['id']:a for a in mod['assets']}
def frame_asset(asset, module=False):
 atlas_name=asset['frame']['atlas']
 path=(ROOT/'public/assets/modules/livestock-dairy/dairy-assets-atlas-v1.png' if module else ROOT/asset['file'].lstrip('/'))
 if not module:
  atlas_spec=core['atlases'][atlas_name];path=ROOT/'public'/atlas_spec['image'].lstrip('/')
 atlas=Image.open(path).convert('RGBA');f=asset['frame'];return atlas.crop((int(f['x']),int(f['y']),int(f['x']+f['w']),int(f['y']+f['h'])))
def core_sprite(aid):return frame_asset(core_assets[aid])
def mod_sprite(aid):return frame_asset(mod_assets[aid],True)
# 2:1 diamond ground tiles from the existing Riose atlas.
tile=Image.open(ROOT/'public/assets/atlas/farm-starter-atlas.png').convert('RGBA').crop((0,0,384,256))
# For this preview only, crop the source tile to its grass top so adjacent modules join without earth-edge seams.
mask=Image.new('L',tile.size,0);ImageDraw.Draw(mask).polygon([(200,16),(378,126),(205,240),(24,130)],fill=255)
import numpy as np
alpha=np.asarray(tile.getchannel('A')).copy();clip=np.asarray(mask);tile.putalpha(Image.fromarray((alpha.astype('uint16')*clip.astype('uint16')//255).astype('uint8'),'L'))
tile=tile.crop(mask.getbbox()).resize((174,110),Image.Resampling.LANCZOS)
W,H=1600,1050;scene=Image.new('RGBA',(W,H),(44,55,44,255));cx=800;top=20;dx=87;dy=55
for row in range(8):
 for col in range(8):
  x=round(cx+(col-row)*dx-tile.width/2);y=round(top+(col+row)*dy)
  scene.alpha_composite(tile,(x,y))
items=[]
def place(sprite, col,row,scale,label,src):
 im=sprite.copy();im.thumbnail((int(im.width*scale),int(im.height*scale)),Image.Resampling.LANCZOS)
 x=round(cx+(col-row)*dx-im.width/2);y=round(top+(col+row)*dy-im.height+8)
 items.append((top+(col+row)*dy,im,(x,y),label,src))
# Dairy facility cluster, ordered by ground anchor for correct overlap.
place(mod_sprite('dairy-barn'),6,2,.44,'Galpão leiteiro','module')
place(mod_sprite('dairy-milking-parlor'),4,4,.42,'Sala de ordenha','module')
place(mod_sprite('dairy-milk-chilling-tank'),7,4,.43,'Tanque de leite','module')
place(mod_sprite('dairy-waiting-pen'),2,5,.42,'Curral de espera','module')
# Shared core props, called through global runtime IDs and not copied into dairy library.
place(core_sprite('fence-wire-wood-post-imagegen-v1'),1,4,.28,'Cerca compartilhada','core')
place(core_sprite('feed-trough-hay-imagegen-v1'),5,6,.30,'Cocho compartilhado','core')
place(core_sprite('water-trough-round-imagegen-v1'),0,6,.31,'Bebedouro compartilhado','core')
place(core_sprite('vegetation-tree-shade-imagegen-v1'),0,4,.30,'Árvore','core')
place(core_sprite('technology-gateway-antenna-imagegen-v1'),7,1,.19,'Gateway compartilhado','core')
# Small milk herd in a paddock beside the dairy buildings.
place(mod_sprite('dairy-holstein-cow'),1,2,.20,'Holandesa','module')
place(mod_sprite('dairy-girolando-cow'),5,1,.20,'Girolando','module')
place(mod_sprite('dairy-heifer'),0,4,.18,'Novilha','module')
place(mod_sprite('dairy-heifer-calf'),2,5,.16,'Bezerra','module')
for _,im,pos,_,_ in sorted(items,key=lambda q:q[0]):scene.alpha_composite(im,pos)
scene.crop((80,0,1520,970)).convert('RGB').save(PRE/'dairy-scene-v1.png',quality=94)
# Direct side-by-side review board; style reference and composed dairy scene.
ref=Image.open(ROOT/'docs/assets/pixel-art-urban-reference.png').convert('RGB')
board=Image.new('RGB',(1920,1100),(31,35,39));d=ImageDraw.Draw(board)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',25)
d.text((40,24),'REFERÊNCIA URBANA — LINGUAGEM VISUAL',font=font,fill=(243,240,229))
d.text((990,24),'RIOSE — CENA LEITEIRA V1',font=font,fill=(243,240,229))
ref.thumbnail((900,1000),Image.Resampling.LANCZOS);scene2=Image.open(PRE/'dairy-scene-v1.png').convert('RGB');scene2.thumbnail((900,1000),Image.Resampling.LANCZOS)
board.paste(ref,(45,80));board.paste(scene2,(990,80));board.save(PRE/'dairy-style-comparison-v1.png',quality=95)
print(PRE/'dairy-scene-v1.png')
print(PRE/'dairy-style-comparison-v1.png')
