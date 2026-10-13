#!/usr/bin/env python3
"""Build a review contact sheet from a small pilot ID list and the canonical asset manifest."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PILOT = ROOT / 'assets/pilots/cattle-ranch-v1/pilot.json'
MANIFEST = ROOT / 'assets/manifests/manifest.json'
OUTPUT = ROOT / 'assets/previews/pilot-v3/contact-sheet.png'


def main():
    pilot=json.loads(PILOT.read_text())
    manifest=json.loads(MANIFEST.read_text())
    by_id={asset['id']:asset for asset in manifest['assets']}
    assets=[]
    for asset_id in pilot['assetIds']:
        if asset_id not in by_id:
            raise SystemExit(f'missing asset ID: {asset_id}')
        asset=by_id[asset_id]
        image_path=ROOT/asset['file']
        if not image_path.is_file():
            raise SystemExit(f'missing asset file: {asset_id}: {image_path}')
        assets.append((asset,Image.open(image_path).convert('RGBA')))
    cols=4; rows=(len(assets)+cols-1)//cols
    cell_w,cell_h=390,330; gap=20; margin=28; header_h=105
    width=margin*2+cols*cell_w+(cols-1)*gap
    height=header_h+margin+rows*cell_h+(rows-1)*gap+margin
    canvas=Image.new('RGB',(width,height),(246,245,239));draw=ImageDraw.Draw(canvas)
    regular=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
    small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10)
    bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',23)
    draw.text((margin,22),'RIOSE · PILOTO VISUAL DE PECUÁRIA BOVINA',font=bold,fill=(35,43,37))
    approved=sum(a.get('status')=='APPROVED' for a,_ in assets)
    draw.text((margin,59),f'{len(assets)} PNGs do manifesto · {approved} APPROVED · {len(assets)-approved} REVIEW · origem e metadados preservados',font=regular,fill=(75,81,73))
    for i,(asset,image) in enumerate(assets):
        x=margin+(i%cols)*(cell_w+gap);y=header_h+(i//cols)*(cell_h+gap)
        draw.rounded_rectangle((x,y,x+cell_w,y+cell_h),radius=8,fill=(255,255,255),outline=(207,205,195),width=2)
        name=asset.get('name',asset['id'])
        draw.text((x+14,y+10),name[:40],font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14),fill=(37,45,39))
        draw.text((x+14,y+34),asset['id'],font=small,fill=(76,81,74))
        status=asset.get('status','DRAFT')
        status_color=(43,102,59) if status=='APPROVED' else (145,92,35)
        draw.text((x+14,y+51),status,font=small,fill=status_color)
        bx,by,bw,bh=x+14,y+72,cell_w-28,cell_h-88
        checker=Image.new('RGBA',(bw,bh),(240,240,240,255));d=ImageDraw.Draw(checker)
        sz=18
        for cy in range(0,bh,sz):
            for cx in range(0,bw,sz):
                if (cx//sz+cy//sz)%2:d.rectangle((cx,cy,cx+sz-1,cy+sz-1),fill=(215,215,215,255))
        scale=min(bw/image.width,bh/image.height)
        image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
        checker.alpha_composite(image,((bw-image.width)//2,(bh-image.height)//2))
        canvas.paste(checker.convert('RGB'),(bx,by))
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(OUTPUT,optimize=True)
    print(f'wrote {OUTPUT.relative_to(ROOT)} ({len(assets)} assets)')

if __name__=='__main__':main()
