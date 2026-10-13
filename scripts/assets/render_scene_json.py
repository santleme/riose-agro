#!/usr/bin/env python3
"""Render a Riose renderer-neutral scene JSON with its semantic PNG manifest."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[2]
MANIFEST_PATH=ROOT/'assets/manifests/manifest.json'

def load_asset(path):
    image=Image.open(path).convert('RGBA')
    alpha=image.getchannel('A')
    bbox=alpha.point(lambda v:255 if v>=24 else 0).getbbox() or alpha.getbbox()
    return image.crop(bbox) if bbox else image

def fitted(path, size, flip=None, rotate=0):
    image=load_asset(path)
    scale=min(size[0]/image.width,size[1]/image.height)
    image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
    if flip=='v': image=ImageOps.flip(image)
    elif flip=='h': image=ImageOps.mirror(image)
    if rotate: image=image.rotate(rotate,expand=True,resample=Image.Resampling.BICUBIC)
    return image

def main(scene_path, output_path):
    scene_path=Path(scene_path); output_path=Path(output_path)
    if not scene_path.is_absolute(): scene_path=ROOT/scene_path
    if not output_path.is_absolute(): output_path=ROOT/output_path
    scene=json.loads(scene_path.read_text())
    manifest=json.loads(MANIFEST_PATH.read_text())
    records={asset['id']:asset for asset in manifest['assets']}
    terrain=records.get(scene.get('terrainAssetId'))
    if not terrain: raise ValueError(f"Unknown terrain asset ID: {scene.get('terrainAssetId')}")
    ground_path=ROOT/terrain['file']
    ground=Image.open(ground_path).convert('RGBA')
    if list(ground.size)!=scene.get('footprintPx'):
        raise ValueError(f"Terrain dimensions {ground.size} do not match scene footprint {scene.get('footprintPx')}")
    alpha=ground.getchannel('A').point(lambda value:0 if value<24 else value)
    ground.putalpha(alpha)
    canvas=Image.new('RGBA',ground.size,(0,0,0,0)); canvas.alpha_composite(ground)

    for overlay in scene.get('groundingOverlays',[]):
        record=records.get(overlay['assetId'])
        if not record: raise ValueError(f"Unknown grounding asset ID: {overlay['assetId']}")
        size=overlay['renderSizePx']
        image=fitted(ROOT/record['file'],size)
        opacity=overlay.get('opacity',255)
        image.putalpha(image.getchannel('A').point(lambda value:round(value*opacity/255)))
        x,y=overlay['centerPx']; pos=(round(x-image.width/2),round(y-image.height/2))
        canvas.alpha_composite(image,pos)

    placements=scene.get('placements',[])
    for item in placements:
        if item['assetId'] not in records: raise ValueError(f"Unknown placement asset ID: {item['assetId']}")
    for item in sorted(placements,key=lambda record:(record.get('depthKey',record['anchorPx'][1]),record['placementId'])):
        meta=records[item['assetId']]
        transform=item.get('transform',{})
        image=fitted(ROOT/meta['file'],item['requestedSizePx'],
                     transform.get('flip'),transform.get('rotationDegreesCCW',0))
        anchor=item.get('anchorNormalized',[meta['anchor']['x'],meta['anchor']['y']])
        x,y=item['anchorPx']; pos=(round(x-anchor[0]*image.width),round(y-anchor[1]*image.height))
        canvas.alpha_composite(image,pos)

    settings=scene.get('renderSettings',{})
    scale=settings.get('scale',1.0)
    scene_image=canvas.resize((round(canvas.width*scale),round(canvas.height*scale)),Image.Resampling.LANCZOS)
    margin_x=settings.get('frameMarginX',0); margin_top=settings.get('frameMarginTop',0); margin_bottom=settings.get('frameBottomMargin',0)
    frame_width=scene_image.width+2*margin_x
    frame_height=scene_image.height+margin_top+margin_bottom
    bg=tuple(settings.get('backgroundRGB',[246,245,239]))+(255,)
    frame=Image.new('RGBA',(frame_width,frame_height),bg); frame.alpha_composite(scene_image,(margin_x,margin_top))
    draw=ImageDraw.Draw(frame)
    font_root=Path('/usr/share/fonts/truetype/dejavu')
    def get_font(size,bold=False):
        name='DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
        return ImageFont.truetype(str(font_root/name),size)
    draw.text((38,24),settings.get('title','RIOSE'),font=get_font(25,True),fill=(38,47,40,255))
    draw.text((40,62),settings.get('subtitle',''),font=get_font(15),fill=(80,87,78,255))
    footer=settings.get('footer','')
    if footer: draw.text((40,frame_height-39),footer,font=get_font(14,True),fill=(80,87,78,255))
    output_path.parent.mkdir(parents=True,exist_ok=True)
    frame.convert('RGB').save(output_path,quality=96,optimize=True)
    print(f"rendered {output_path} from {len(placements)} placements and {len(scene.get('groundingOverlays',[]))} grounding overlays")

if __name__=='__main__':
    if len(sys.argv)!=3:
        raise SystemExit('usage: render_scene_json.py SCENE.json OUTPUT.png')
    main(sys.argv[1],sys.argv[2])
