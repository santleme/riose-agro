#!/usr/bin/env python3
"""Build an evidence board comparing the live cattle-ranch pilot with its three reference roles."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/previews/pilot-v3/approval-comparison.png'
SOURCES = [
    ('URBANA · COMPOSIÇÃO', 'hierarquia, footprint, densidade conectada', ROOT/'docs/assets/pixel-art-urban-reference.png'),
    ('FAZENDA V7 · CONTEÚDO / ESCALA', 'conteúdo e escala rural brasileira', ROOT/'docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png'),
    ('RIOSE V2 · TERRENO / GROUNDING', 'overlay V2 selecionado: transição terra–pasto', ROOT/'assets/candidates/terrain-family-v6/compacted-grounding-v2-hard-alpha.png'),
    ('RIOSE · CENA PILOTO APROVADA', 'V4 + overlay de solo V2 selecionado; 82 placements', ROOT/'assets/previews/ranch-composition-v4/rural-diorama-final-approved-pilot.png'),
]


def main():
    w,h=2000,1340
    canvas=Image.new('RGB',(w,h),(246,245,239));d=ImageDraw.Draw(canvas)
    reg=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
    small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
    bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',27)
    d.text((44,28),'RIOSE · GATE VISUAL DA FASE B — APROVADO',font=bold,fill=(35,43,37))
    d.text((44,69),'Usuário aprovou o kit de 12 sprites e a cena composta em 2026-10-13.',font=reg,fill=(75,81,73))
    left_x,left_w=42,520
    right_x,right_w=590,1368
    rows=[(122,330),(474,330),(826,330)]
    for i,(title,subtitle,path) in enumerate(SOURCES):
        if i<3:
            x,y=left_x,rows[i][0]; pw,ph=left_w,rows[i][1]
        else:
            x,y=right_x,122;pw,ph=right_w,1034
        d.rounded_rectangle((x,y,x+pw,y+ph),radius=12,fill=(255,255,255),outline=(207,205,195),width=2)
        d.text((x+18,y+16),title,font=bold if i==3 else reg,fill=(37,45,39))
        d.text((x+18,y+51),subtitle,font=small,fill=(76,81,74))
        image=Image.open(path).convert('RGBA')
        area=(x+16,y+83,pw-32,ph-99)
        scale=min(area[2]/image.width,area[3]/image.height)
        image=image.resize((max(1,round(image.width*scale)),max(1,round(image.height*scale))),Image.Resampling.LANCZOS)
        matte=Image.new('RGBA',image.size,(248,247,242,255))
        if i==2:
            checker=ImageDraw.Draw(matte)
            cell=16
            for cy in range(0,image.height,cell):
                for cx in range(0,image.width,cell):
                    if (cx//cell+cy//cell)%2:
                        checker.rectangle((cx,cy,cx+cell-1,cy+cell-1),fill=(218,218,218,255))
        matte.alpha_composite(image)
        image=matte.convert('RGB')
        canvas.paste(image,(area[0]+(area[2]-image.width)//2,area[1]+(area[3]-image.height)//2))
    OUT.parent.mkdir(parents=True,exist_ok=True)
    canvas.save(OUT,optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)}')

if __name__=='__main__':main()
