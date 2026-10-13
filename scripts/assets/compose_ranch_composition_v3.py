#!/usr/bin/env python3
"""Author a block-led, reference-synthesized Riose ranch scene and its zone blockout."""
from pathlib import Path
import json
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/previews/ranch-composition-v3'
OUT.mkdir(parents=True,exist_ok=True)
W,H=1774,887

def font(size,bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',size)

placements=[]
def place(asset,anchor,size,block,flip=None,rotation=0):
    i=len(placements)+1
    placements.append({'placementId':f'v3-placement-{i:03d}','assetId':asset,
       'anchorPx':list(anchor),'requestedSizePx':list(size),'transform':{'flip':flip,'rotationDegreesCCW':rotation},
       'depthKey':anchor[1],'block':block})

def fence_line(points,block,flip=None,rotation=0,size=(112,70)):
    for p in points: place('fence.wire.wood-post.imagegen.v1',p,size,block,flip,rotation)

# Grouped contact wear integrates structures with the unified, authored terrain plate.
overlays=[]
for center,size,opacity in [((1115,365),(214,100),54),((1342,428),(210,104),62),
                           ((1020,635),(230,110),76),((770,680),(160,72),45)]:
    overlays.append({'assetId':'terrain.soil.compacted-patch.imagegen.v2','centerPx':list(center),
                     'renderSizePx':list(size),'opacity':opacity,'layer':'grounding'})

# BLOCK 1 — headquarters: a small, legible homestead with shade and a service path.
place('building.farmhouse.imagegen.v2',(685,492),(258,179),'headquarters')
place('water.reservoir.imagegen.v1',(782,528),(74,62),'headquarters')
place('vegetation.tree.shade.imagegen.v2',(590,470),(78,95),'headquarters-garden')
place('vegetation.tree.shade.imagegen.v2',(781,443),(70,86),'headquarters-garden')
place('vehicle.pickup.rural.imagegen.v1',(826,563),(99,69),'headquarters-access')

# BLOCK 2 — crop and field service; the existing field and lane guide the tractor.
place('vehicle.tractor.imagegen.v2',(468,604),(118,92),'crop-service')
place('feed.salt.roofed.imagegen.v1',(536,511),(54,60),'crop-service')
place('vegetation.tree.shade.imagegen.v2',(383,612),(76,92),'crop-edge')

# BLOCK 3 — connected farm service yard beside the road, with two distinct structures.
place('building.shed.imagegen.v1',(1192,428),(217,158),'service-yard')
place('building.workshop.imagegen.v1',(1022,481),(153,121),'service-yard')
place('vehicle.livestock-truck.imagegen.v1',(958,525),(126,91),'service-access')
place('vegetation.tree.shade.imagegen.v2',(1280,493),(71,88),'service-edge')
place('vegetation.tree.shade.imagegen.v2',(1085,357),(72,90),'service-edge')

# BLOCK 4 — central handling hub, with a clear approach from both pasture and service road.
place('corral.wood.standard.imagegen.v1',(954,634),(196,141),'handling-hub')
place('fence.gate.wood.imagegen.v1',(1015,665),(70,54),'handling-hub')
place('handling.alley.cattle.imagegen.v1',(1090,673),(118,87),'handling-hub')
place('handling.chute.cattle.imagegen.v1',(1139,700),(75,71),'handling-hub')
place('technology.scale.electronic.full.imagegen.v1',(1172,745),(76,62),'handling-hub')
place('feed.trough.hay.imagegen.v1',(797,704),(100,58),'feed-and-water')
place('water.trough.round.imagegen.v1',(843,657),(76,48),'feed-and-water')
place('water.pond.imagegen.v1',(397,615),(122,88),'water-feature')
place('water.reservoir.imagegen.v1',(1480,500),(74,64),'water-tank')

# BLOCK 5 — two fenced pasture modules and one small north grazing pocket.
# Four runs per paddock describe reusable prefab boundaries; segment orientation follows 2:1 axes.
fence_line([(436,515),(540,477)],'west-paddock-boundary',flip='v')
fence_line([(654,438)],'west-paddock-boundary')
fence_line([(685,520),(581,558)],'west-paddock-boundary',rotation=180)
fence_line([(468,565)],'west-paddock-boundary',flip='v',rotation=180)
place('fence.gate.wood.imagegen.v1',(446,549),(68,52),'west-paddock-gate')

fence_line([(1181,540),(1284,502)],'east-paddock-boundary',flip='v')
fence_line([(1376,468)],'east-paddock-boundary')
fence_line([(1397,550),(1294,588)],'east-paddock-boundary',rotation=180)
fence_line([(1194,588)],'east-paddock-boundary',flip='v',rotation=180)
place('fence.gate.wood.imagegen.v1',(1193,573),(66,50),'east-paddock-gate')

# BLOCK 6 — Riose monitoring nodes placed at the water and handling interfaces.
place('technology.gateway.antenna.imagegen.v1',(1434,595),(52,82),'monitoring-network')
place('technology.monitor.station.imagegen.v1',(1227,727),(47,74),'monitoring-network')
place('technology.traceability.system.imagegen.v1',(1076,606),(54,57),'monitoring-network')

# Representative cattle: deterministic clusters within each operational zone (14 visible sprites).
cattle=[
 ('livestock.nelore.adult.grazing.ne.v1',(500,517),(58,48),'west-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(563,496),(56,47),'west-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(611,526),(56,47),'west-pasture'),
 ('livestock.nelore.adult.grazing.ne.v1',(548,552),(57,47),'west-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(1255,535),(56,47),'east-pasture'),
 ('livestock.nelore.adult.grazing.ne.v1',(1315,515),(57,47),'east-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1360,543),(55,46),'east-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(1298,570),(55,46),'east-pasture'),
 ('livestock.nelore.adult.grazing.ne.v1',(822,322),(56,47),'north-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(884,302),(55,46),'north-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(942,329),(56,47),'north-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(918,589),(54,46),'handling-hub'),
 ('livestock.nelore.adult.walking.ne.v1',(965,610),(54,46),'handling-hub'),
 ('livestock.nelore.calf.idle.ne.v1',(1021,635),(43,37),'handling-hub'),
]
for aid,anchor,size,block in cattle: place(aid,anchor,size,block)

# Intentional green border, orchard-like shade groups and visual breathing spaces.
for anchor,size,block in [((202,511),(79,95),'green-border'),((425,610),(77,93),'green-border'),
                          ((640,690),(72,88),'green-border'),((722,263),(74,91),'north-grove'),
                          ((1057,290),(70,86),'north-grove'),((1471,449),(81,98),'green-border'),
                          ((1374,600),(77,92),'green-border'),((1194,690),(68,83),'green-border'),
                          ((708,395),(61,75),'homestead-shade'),((846,225),(72,88),'north-grove'),
                          ((963,203),(76,93),'north-grove'),((1084,264),(70,86),'north-grove')]:
    place('vegetation.tree.shade.imagegen.v2',anchor,size,block)

# Recompose the same reusable sprite blocks over the new slab plate. The new plate
# places crop rows in the left/front quadrant and carries the road through the center.
block_shift={
 'headquarters':(245,-125),'headquarters-garden':(245,-125),'headquarters-access':(245,-125),
 'service-yard':(150,0),'service-access':(330,70),'service-edge':(120,0),
 'handling-hub':(71,20),'feed-and-water':(40,-40),
 'west-paddock-boundary':(350,60),'west-paddock-gate':(350,60),'west-pasture':(350,60),
 'east-paddock-boundary':(0,0),'east-paddock-gate':(0,0),'east-pasture':(0,0),
 'north-pasture':(0,0),'north-pasture-boundary':(0,0),
 'north-grove':(0,0),'green-border':(0,0),'homestead-shade':(245,-125),
 'monitoring-network':(0,-40),
}
for item in placements:
    dx,dy=block_shift.get(item['block'],(0,0))
    if item['assetId']=='feed.salt.roofed.imagegen.v1': dx,dy=280,40
    if item['assetId']=='water.pond.imagegen.v1': dx,dy=373,65
    if item['assetId']=='water.reservoir.imagegen.v1' and item['block']=='water-feature': dx,dy=0,0
    if item['assetId']=='building.shed.imagegen.v1': dx,dy=258,2
    if item['assetId']=='building.workshop.imagegen.v1': dx,dy=168,19
    if item['assetId']=='vehicle.pickup.rural.imagegen.v1': dx,dy=264,-43
    if item['assetId']=='corral.wood.standard.imagegen.v1': dx,dy=56,1
    if item['assetId']=='fence.gate.wood.imagegen.v1' and item['block']=='handling-hub': dx,dy=65,-10
    if item['assetId']=='handling.alley.cattle.imagegen.v1': dx,dy=45,-33
    if item['assetId']=='handling.chute.cattle.imagegen.v1': dx,dy=10,-45
    if item['assetId']=='technology.scale.electronic.full.imagegen.v1': dx,dy=8,-65
    if item['assetId'].startswith('livestock.') and item['block']=='handling-hub': dx,dy=70,20
    if item['block']=='green-border':
        x,y=item['anchorPx']
        if x>1400: dx,dy=-85,-40
        elif x<300: dx,dy=0,0
        elif y>700: dx,dy=40,-45
        elif x<500 and y>580: dx,dy=-80,-40
    if item['block']=='monitoring-network' and item['anchorPx'][0]>1400: dx,dy=-100,-35
    if item['block']=='monitoring-network' and item['anchorPx'][1]>700: dx,dy=-60,-90
    item['anchorPx']=[item['anchorPx'][0]+dx,item['anchorPx'][1]+dy]
    item['depthKey']=item['anchorPx'][1]

# The scene has a pond and a separate elevated water tank, so their prefab anchors stay local.
for item in placements:
    if item['assetId']=='water.pond.imagegen.v1': item['block']='water-pond'
    elif item['assetId']=='water.reservoir.imagegen.v1': item['block']='water-tank'

# Zones define a designed sequence around the road and central handling spine.
zones=[
 {'id':'cultivo','label':'CULTIVO','polygon':[[174,482],[458,326],[764,482],[458,638]]},
 {'id':'casa-sede','label':'CASA-SEDE','polygon':[[840,390],[930,348],[1020,390],[930,432]]},
 {'id':'servicos','label':'GALPÃO / SERVIÇOS','polygon':[[1170,460],[1325,400],[1480,460],[1325,520]]},
 {'id':'manejo','label':'CURRAL / MANEJO','polygon':[[946,650],[1050,604],[1154,650],[1050,696]]},
 {'id':'agua','label':'ÁGUA','polygon':[[698,695],[770,661],[842,695],[770,729]]},
 {'id':'piquete-oeste','label':'PIQUETE OESTE','polygon':[[810,577],[880,545],[950,577],[880,609]]},
 {'id':'piquete-leste','label':'PIQUETE LESTE','polygon':[[1285,568],[1390,520],[1495,568],[1390,616]]},
 {'id':'pasto-norte','label':'PASTO NORTE','polygon':[[680,285],[800,240],[920,285],[800,330]]},
 {'id':'monitoramento','label':'MONITORAMENTO','polygon':[[1160,650],[1260,606],[1360,650],[1260,694]]},
]

blocks={}
for item in placements: blocks.setdefault(item['block'],[]).append(item['placementId'])
prefab_specs=[
 ('headquarters-block',['headquarters','headquarters-garden','headquarters-access'],[930,367],['casa-sede']),
 ('crop-block',['crop-service','crop-edge'],[608,604],['cultivo']),
 ('service-block',['service-yard','service-access','service-edge'],[1342,428],['servicos']),
 ('handling-block',['handling-hub','feed-and-water'],[1050,650],['manejo']),
 ('water-block',['water-pond'],[770,680],['agua']),
 ('water-tank-node',['water-tank'],[1480,500],['agua']),
 ('west-paddock-block',['west-paddock-boundary','west-paddock-gate','west-pasture'],[898,577],['piquete-oeste']),
 ('east-paddock-block',['east-paddock-boundary','east-paddock-gate','east-pasture'],[1390,568],['piquete-leste']),
 ('north-pasture-block',['north-pasture-boundary','north-pasture'],[800,285],['pasto-norte']),
 ('monitoring-block',['monitoring-network'],[1260,650],['monitoramento']),
 ('green-edge-block',['green-border','north-grove','homestead-shade'],[890,500],[]),
]
prefabs=[]
for pid,names,origin,zids in prefab_specs:
    refs=[]
    for item in placements:
        if item['block'] in names:
            refs.append({'placementId':item['placementId'],'offsetPx':[item['anchorPx'][0]-origin[0],item['anchorPx'][1]-origin[1]]})
    prefabs.append({'id':pid,'zoneIds':zids,'originPx':origin,'reusable':True,'placements':refs})

scene={
 'schemaVersion':1,'sceneId':'rural-diorama-composition-v3','projection':'isometric-2:1','footprintPx':[W,H],
 'terrainPlate':'assets/candidates/terrain-family-v5/rural-diorama-ground-v2.png',
 'terrainAssetId':'terrain.ranch.complete-ground.imagegen.v2',
 'terrainMode':'single-authored-plate-with-integrated-grass-dirt-crop-transitions',
 'referenceRoles':{'urban':'composição, hierarquia visual, footprint e leitura conectada das zonas',
                   'fazendaV7':'conteúdo rural, escala e densidade da fazenda',
                   'rioseV2':'transições do solo, vegetação controlada, uso localizado e grounding'},
 'visualAnimalBudget':{'mode':'sampled-miniature','visibleCount':len(cattle),
   'populationBinding':'none; deterministic representative visual lot, not scientific individual identities'},
 'compositionBlocks':['crop-block','headquarters-block','handling-block','service-block','water-block',
                      'pasture-blocks','green-edge-block','monitoring-block'],
 'zones':zones,'groundingOverlays':overlays,'prefabs':prefabs,'placements':placements,
 'renderSettings':{'scale':1.0,'frameMarginX':60,'frameMarginTop':112,'frameBottomMargin':76,
   'backgroundRGB':[246,245,239],'title':'RIOSE · FAZENDA PECUÁRIA BRASILEIRA',
   'subtitle':'Diorama rural 2:1 · blocos conectados · 14 bovinos representativos',
   'footer':'CULTIVO  ·  SEDE  ·  SERVIÇOS  ·  MANEJO  ·  PASTOS  ·  ÁGUA  ·  RASTREABILIDADE'},
 'artReview':'new reference-synthesis composition candidate; no asset review statuses are changed'
}
json_path=OUT/'rural-diorama-scene-v3.json'
json_path.write_text(json.dumps(scene,indent=2,ensure_ascii=False)+'\n')

# Zone blockout: editorial overlays only; final artwork is always rendered from JSON + real PNGs.
manifest=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
ground_path=ROOT/next(a['file'] for a in manifest['assets'] if a['id']==scene['terrainAssetId'])
ground=Image.open(ground_path).convert('RGBA')
block=Image.new('RGBA',(W,H),(246,245,239,255)); block.alpha_composite(ground)
overlay=Image.new('RGBA',(W,H),(0,0,0,0)); draw=ImageDraw.Draw(overlay)
palette=[(183,132,72,92),(197,158,101,96),(132,128,110,98),(132,88,61,112),
         (70,143,164,112),(83,135,70,84),(72,132,67,84),(76,128,63,84),(66,130,145,104)]
for z,color in zip(zones,palette):
    pts=[tuple(p) for p in z['polygon']]
    draw.polygon(pts,fill=color,outline=(46,55,45,210),width=3)
block.alpha_composite(overlay); draw=ImageDraw.Draw(block)
for z in zones:
    pts=z['polygon']; xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    label=z['label']; f=font(10,True); tw=draw.textbbox((0,0),label,font=f)[2]
    cx=(min(xs)+max(xs))//2; cy=(min(ys)+max(ys))//2
    draw.rounded_rectangle((cx-tw//2-7,cy-12,cx+tw//2+7,cy+12),radius=5,fill=(248,247,241,236))
    draw.text((cx-tw//2,cy-9),label,font=f,fill=(38,47,40,255))
scale=1.0; mx,mt=60,112; footer=76
frame=Image.new('RGBA',(W+2*mx,H+mt+footer),(246,245,239,255)); frame.alpha_composite(block,(mx,mt))
d=ImageDraw.Draw(frame); d.text((38,24),'RIOSE · BLOCKOUT TERRITORIAL V3',font=font(25,True),fill=(38,47,40,255))
d.text((40,62),'O caminho conecta cultivo e núcleo da sede; curral, água, serviços e piquetes ocupam blocos funcionais distintos.',font=font(14),fill=(80,87,78,255))
d.text((40,frame.height-38),'BLOCOS: CULTIVO  →  SEDE  →  SERVIÇOS / MANEJO  →  PIQUETES  ·  ÁGUA E TECNOLOGIA NOS PONTOS DE USO',font=font(12,True),fill=(80,87,78,255))
frame.convert('RGB').save(OUT/'rural-diorama-zone-blockout-v3.png',quality=96,optimize=True)
subprocess.run([sys.executable,str(ROOT/'scripts/assets/render_scene_json.py'),str(json_path),str(OUT/'rural-diorama-refined-v3.png')],check=True)

# Role-separated visual comparison: each reference is paired with only the quality it governs.
comparison=Image.new('RGB',(1780,1210),(243,242,236)); cd=ImageDraw.Draw(comparison)
panels=[
 ('URBANA · COMPOSIÇÃO',ROOT/'docs/assets/pixel-art-urban-reference.png','hierarquia, densidade e footprint'),
 ('FAZENDA V7 · CONTEÚDO / ESCALA',ROOT/'docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png','organização e riqueza rural'),
 ('RIOSE V2 · TERRENO',ROOT/'assets/previews/pilot-v2/ranch-pilot-terrain-v3.png','transições e grounding'),
 ('RIOSE · SÍNTESE V3',OUT/'rural-diorama-refined-v3.png','nova composição candidata'),
]
pw,ph=850,550; gap=28; left=20; top=20
for index,(title,path,caption) in enumerate(panels):
    col=index%2; row=index//2; x=left+col*(pw+gap); y=top+row*(ph+gap)
    source=Image.open(path).convert('RGBA')
    inner=(pw-28,ph-106); ratio=min(inner[0]/source.width,inner[1]/source.height)
    source=source.resize((round(source.width*ratio),round(source.height*ratio)),Image.Resampling.LANCZOS)
    cd.rounded_rectangle((x,y,x+pw,y+ph),radius=15,fill=(255,255,252),outline=(195,193,184),width=2)
    cd.text((x+20,y+14),title,font=font(18,True),fill=(43,52,44))
    ix=x+(pw-source.width)//2; iy=y+45+(inner[1]-source.height)//2
    comparison.paste(source.convert('RGB'),(ix,iy))
    cd.text((x+20,y+ph-43),caption,font=font(14),fill=(82,88,78))
comparison.save(OUT/'reference-role-comparison-v3.png',quality=94,optimize=True)

(OUT/'README.md').write_text('''# Riose rural diorama composition v3\n\nThis is a new, renderer-neutral scene composition authored from the existing semantic asset manifest. The prior v1 preview is preserved.\n\n- `rural-diorama-zone-blockout-v3.png`: territorial blockout for crop, headquarters, services, handling, water, three pasture zones, and monitoring.\n- `rural-diorama-refined-v3.png`: actual image assets rendered from the saved JSON scene.\n- `rural-diorama-scene-v3.json`: source of truth; 65 placements, 11 reusable prefab groups, 9 zones, and 14 deterministic representative cattle sprites.\n- `reference-role-comparison-v3.png`: direct comparison with the urban composition reference, approved Fazenda V7, and Riose V2 terrain treatment.\n\nReference roles are deliberately separated: urban reference = composition only; V7 = rural content and scale; Riose V2 = terrain transitions, vegetation control, and grounding. No assets were promoted and no scientific population data is bound to the representative animal sprites.\n\nRebuild with `python3 scripts/assets/compose_ranch_composition_v3.py`. The script writes the blockout and scene JSON, then renders the refined image through `scripts/assets/render_scene_json.py`. This scene is a review candidate; artistic approval remains with the project owner.\n''')
print(f'created {OUT}; placements={len(placements)}; zones={len(zones)}; prefabs={len(prefabs)}; cattle={len(cattle)}')
