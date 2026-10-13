#!/usr/bin/env python3
"""Build a scene-specific review sheet from the scene JSON and semantic manifest."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from collections import Counter
import re

ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scene',type=Path,default=Path('assets/previews/ranch-composition-v3/rural-diorama-scene-v3.json'))
parser.add_argument('--output',type=Path,default=Path('assets/previews/ranch-composition-v3/asset-contact-sheet-v3.png'))
parser.add_argument('--columns',type=int,default=5)
args=parser.parse_args()
scene_path=args.scene if args.scene.is_absolute() else ROOT/args.scene
output_path=args.output if args.output.is_absolute() else ROOT/args.output
scene=json.loads(scene_path.read_text())
manifest=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
records={item['id']:item for item in manifest['assets']}
ids=sorted({item['assetId'] for item in scene.get('placements',[])} | {item['assetId'] for item in scene.get('groundingOverlays',[])})
missing=set(ids)-set(records)
if missing: raise ValueError(f'manifest assets missing: {sorted(missing)}')
terrain=records[scene['terrainAssetId']]
columns=args.columns
if columns<1: raise ValueError('--columns must be positive')

background=(244,243,238); ink=(40,48,42); muted=(91,97,88)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
title_font=ImageFont.truetype(bold_path,26)
subtitle_font=ImageFont.truetype(font_path,15)
label_font=ImageFont.truetype(bold_path,12)
meta_font=ImageFont.truetype(font_path,11)

def checker(size,step=12):
    im=Image.new('RGBA',size,(238,238,234,255)); d=ImageDraw.Draw(im)
    for y in range(0,size[1],step):
        for x in range(0,size[0],step):
            if (x//step+y//step)%2:
                d.rectangle((x,y,x+step-1,y+step-1),fill=(216,216,211,255))
    return im

pad=20; gap=16; card_w=328; art_h=145; label_h=42
rows=(len(ids)+columns-1)//columns
sheet_w=pad*2+columns*card_w+(columns-1)*gap
header_h=86; terrain_h=round((sheet_w-pad*2)/2)+75; section_gap=24
grid_h=rows*(art_h+label_h)+(rows-1)*gap
sheet=Image.new('RGB',(sheet_w,header_h+terrain_h+section_gap+grid_h+pad),background)
d=ImageDraw.Draw(sheet)
version=re.search(r'-v(\d+)',scene.get('sceneId',''))
version_label=f"V{version.group(1)}" if version else scene.get('sceneId','PILOTO').upper()
status_counts=Counter(records[item].get('status','UNKNOWN') for item in ids)
d.text((pad,pad),f'RIOSE · CONTACT SHEET DO PILOTO {version_label}',font=title_font,fill=ink)
summary=' · '.join(f'{count} {status}' for status,count in sorted(status_counts.items()))
d.text((pad,pad+42),f'{len(ids)} sprites únicos (inclui grounding) · placa separada · {summary}',font=subtitle_font,fill=muted)

# The terrain is shown as its own wide card so its edge and complete footprint remain readable.
ty=header_h
panel=(pad,ty,sheet_w-pad,ty+terrain_h)
d.rounded_rectangle(panel,radius=12,fill=(255,255,252),outline=(190,190,183),width=2)
d.text((pad+14,ty+10),f"TERRENO · {terrain['id']} · {terrain['status']} / {terrain.get('review',{}).get('art','n/a')}:{terrain.get('review',{}).get('technical','n/a')}",font=label_font,fill=ink)
ground=Image.open(ROOT/terrain['file']).convert('RGBA')
alpha=ground.getchannel('A'); bounds=alpha.point(lambda v:255 if v>=24 else 0).getbbox() or alpha.getbbox()
if bounds: ground=ground.crop(bounds)
max_size=(sheet_w-pad*2-40,terrain_h-58)
ground.thumbnail(max_size,Image.Resampling.LANCZOS)
bg=checker(max_size)
bg.alpha_composite(ground,((max_size[0]-ground.width)//2,(max_size[1]-ground.height)//2))
sheet.paste(bg.convert('RGB'),(pad+20,ty+42))

start_y=header_h+terrain_h+section_gap
for index,asset_id in enumerate(ids):
    asset=records[asset_id]
    row,col=divmod(index,columns)
    x=pad+col*(card_w+gap); y=start_y+row*(art_h+label_h+gap)
    d.rounded_rectangle((x,y,x+card_w,y+art_h+label_h),radius=8,fill=(255,255,252),outline=(196,195,187),width=1)
    im=Image.open(ROOT/asset['file']).convert('RGBA')
    alpha=im.getchannel('A'); bounds=alpha.point(lambda v:255 if v>=24 else 0).getbbox() or alpha.getbbox()
    if bounds: im=im.crop(bounds)
    im.thumbnail((card_w-20,art_h-14),Image.Resampling.LANCZOS)
    bg=checker((card_w-12,art_h-8))
    bg.alpha_composite(im,((bg.width-im.width)//2,(bg.height-im.height)//2))
    sheet.paste(bg.convert('RGB'),(x+6,y+4))
    status=asset.get('status','UNKNOWN')
    review=asset.get('review',{})
    d.text((x+7,y+art_h+3),asset_id,font=label_font,fill=ink)
    d.text((x+7,y+art_h+21),f"{status} · art {review.get('art','n/a')} · tech {review.get('technical','n/a')}",font=meta_font,fill=muted)

output_path.parent.mkdir(parents=True,exist_ok=True)
sheet.save(output_path,optimize=True)
print(f'{output_path} · {len(ids)} sprites + 1 terrain plate')
