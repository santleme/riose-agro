#!/usr/bin/env python3
"""Build an inspection-only contact sheet from semantic-manifest PNGs."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
cell_w,cell_h,cols,rows=320,250,3,4
pad,label_h=20,34
canvas=Image.new('RGB',(pad+cols*(cell_w+pad),pad+rows*(cell_h+label_h+pad)),(244,243,238))
draw=ImageDraw.Draw(canvas)
font=ImageFont.load_default()
def checker(size,step=10):
 im=Image.new('RGBA',size,(235,235,235,255)); d=ImageDraw.Draw(im)
 for y in range(0,size[1],step):
  for x in range(0,size[0],step):
   if (x//step+y//step)%2: d.rectangle((x,y,x+step-1,y+step-1),fill=(209,209,209,255))
 return im
for idx,asset in enumerate(manifest['assets']):
 row,col=divmod(idx,cols); x=pad+col*(cell_w+pad); y=pad+row*(cell_h+label_h+pad)
 path=ROOT/asset['file']; im=Image.open(path).convert('RGBA')
 alpha=im.getchannel('A'); a=alpha.point(lambda v:255 if v>=128 else 0); bounds=a.getbbox() or alpha.getbbox()
 if bounds: im=im.crop(bounds)
 im.thumbnail((cell_w-18,cell_h-18),Image.Resampling.NEAREST)
 bg=checker((cell_w,cell_h)); bg.alpha_composite(im,((cell_w-im.width)//2,(cell_h-im.height)//2))
 canvas.paste(bg.convert('RGB'),(x,y))
 status=asset['status']
 draw.text((x,y+cell_h+4),f"{asset['id']} [{status}]",font=font,fill=(35,42,38))
out=ROOT/'assets/previews/pilot-v1/contact-sheet-drafts.png'
out.parent.mkdir(parents=True,exist_ok=True); canvas.save(out,optimize=True)
print(out)
