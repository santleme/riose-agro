#!/usr/bin/env python3
"""Build a 3x3 repeat proof from any manifested isometric ground tile."""
from pathlib import Path
import argparse, json
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--asset-id',default='terrain.grass.pasture-base.imagegen.v3')
parser.add_argument('--output',default='assets/previews/calibration-v2/pasture-premium-v3-repeat-3x3.png')
parser.add_argument('--inset-px',type=int,default=0,help='Trim this many source pixels from each visible edge before fitting the logical tile')
args=parser.parse_args()
manifest=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
asset=next(a for a in manifest['assets'] if a['id']==args.asset_id)
scale=asset['scaleHints']['preferredRenderSizePx']; footprint=asset['footprint']; cell=asset['scaleHints']['logicalCellPx']
tile=Image.open(ROOT/asset['file']).convert('RGBA')
# Generated sprites may contain transparent gutters. Crop to the real alpha bounds
# before fitting the declared logical footprint, otherwise transparent margins
# become literal gaps between neighboring ground pieces.
alpha_bbox=tile.getchannel('A').getbbox()
if alpha_bbox:
    tile=tile.crop(alpha_bbox)
if args.inset_px:
    tile=tile.crop((args.inset_px,args.inset_px,tile.width-args.inset_px,tile.height-args.inset_px))
tile=tile.resize((scale['width'],scale['height']),Image.Resampling.LANCZOS)
# Adjacent 9x9 logical squares advance by half of the full diamond in each projected axis.
step_x=footprint[0]*cell['width']; step_y=footprint[0]*cell['height']; w,h=tile.size
centers=[((col-row)*step_x,(col+row)*step_y) for row in range(3) for col in range(3)]
min_x=min(x-w//2 for x,y in centers); max_x=max(x+w//2 for x,y in centers)
min_y=min(y-h//2 for x,y in centers); max_y=max(y+h//2 for x,y in centers); margin=24
out=Image.new('RGBA',(max_x-min_x+2*margin,max_y-min_y+2*margin),(247,246,241,255))
for x,y in sorted(centers,key=lambda p:p[1]): out.alpha_composite(tile,(x-w//2-min_x+margin,y-h//2-min_y+margin))
p=ROOT/args.output; p.parent.mkdir(parents=True,exist_ok=True); out.convert('RGB').save(p,optimize=True)
print(f'{p.relative_to(ROOT)}: asset={asset["id"]}, alphaCrop={alpha_bbox}, inset={args.inset_px}px, tile={w}x{h}, footprint={footprint}, logicalCell={cell}, isoStep={step_x}x{step_y}')
