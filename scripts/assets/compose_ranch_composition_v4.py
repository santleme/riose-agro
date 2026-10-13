#!/usr/bin/env python3
"""Compose a role-separated, block-led Riose ranch diorama using manifest PNGs."""
from pathlib import Path
import json
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/previews/ranch-composition-v4'
OUT.mkdir(parents=True,exist_ok=True)
W,H=1774,887
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_B='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(size,bold=False): return ImageFont.truetype(FONT_B if bold else FONT,size)

placements=[]
def place(asset,anchor,size,block,flip=None,rotation=0):
    i=len(placements)+1
    placements.append({'placementId':f'v4-placement-{i:03d}','assetId':asset,
      'anchorPx':list(anchor),'requestedSizePx':list(size),
      'transform':{'flip':flip,'rotationDegreesCCW':rotation},'depthKey':anchor[1],'block':block})
def fence_run(coords,block,flip=None,rotation=0):
    for xy in coords: place('fence.wire.wood-post.imagegen.v1',xy,(106,68),block,flip,rotation)

# GROVE AND HOMESTEAD BLOCK: a shaded, compact domestic island beside the road.
place('building.farmhouse.imagegen.v2',(852,384),(250,174),'homestead')
place('vehicle.pickup.rural.imagegen.v1',(1007,438),(91,63),'homestead-yard')
place('water.reservoir.imagegen.v1',(760,421),(67,57),'homestead-water')
place('vegetation.tree.shade.imagegen.v2',(755,373),(69,83),'homestead-grove')
place('vegetation.tree.shade.imagegen.v2',(1009,357),(67,81),'homestead-grove')
place('vegetation.tree.shade.imagegen.v2',(1043,416),(63,77),'homestead-grove')
place('feed.salt.roofed.imagegen.v1',(757,467),(51,56),'homestead-yard')

# CROP BLOCK: crop rows remain the visual field; tractor, access, and trees frame it.
place('vehicle.tractor.imagegen.v2',(524,577),(110,86),'cultivation')
place('vegetation.tree.shade.imagegen.v2',(192,533),(68,82),'crop-edge')
place('vegetation.tree.shade.imagegen.v2',(350,590),(67,81),'crop-edge')
place('vegetation.tree.shade.imagegen.v2',(711,632),(63,77),'crop-edge')
place('feed.trough.hay.imagegen.v1',(616,511),(82,49),'cultivation-support')

# SERVICE BLOCK: barn, workshop, transport, and storage share one connected work yard.
place('building.shed.imagegen.v1',(1286,405),(207,151),'service-yard')
place('building.workshop.imagegen.v1',(1119,461),(144,112),'service-yard')
place('vehicle.livestock-truck.imagegen.v1',(1055,526),(114,82),'service-access')
place('water.reservoir.imagegen.v1',(1450,454),(64,56),'service-water')
place('vegetation.tree.shade.imagegen.v2',(1401,365),(68,83),'service-grove')

# HANDLING BLOCK: a compact corral sequence follows the approach road, with a clear gate.
place('corral.wood.standard.imagegen.v1',(1057,648),(177,128),'handling-core')
place('fence.gate.wood.imagegen.v1',(1032,670),(64,49),'handling-core')
place('handling.alley.cattle.imagegen.v1',(1168,659),(105,78),'handling-core')
place('handling.chute.cattle.imagegen.v1',(1155,653),(68,65),'handling-core')
place('technology.scale.electronic.full.imagegen.v1',(1170,650),(70,57),'handling-core')
place('feed.trough.hay.imagegen.v1',(897,672),(88,52),'handling-support')
place('water.trough.round.imagegen.v1',(843,640),(67,44),'handling-support')
place('water.pond.imagegen.v1',(717,686),(105,76),'water-block')

# PASTURE PREFABS: two fenced cells and one open grazing area follow the terrain and road.
# At scene scale, adjacent fence spans overlap at their posts to read as continuous boundaries.
fence_run([(438,276),(486,252)],'west-paddock-boundary',flip='v')
fence_run([(584,252),(632,276)],'west-paddock-boundary')
fence_run([(632,324),(584,348)],'west-paddock-boundary',rotation=180)
fence_run([(486,348),(438,324)],'west-paddock-boundary',flip='v',rotation=180)
place('fence.gate.wood.imagegen.v1',(390,322),(62,48),'west-paddock-gate')
place('water.trough.round.imagegen.v1',(558,318),(62,41),'west-paddock-water')
place('feed.salt.roofed.imagegen.v1',(602,352),(47,52),'west-paddock-feed')

# NE pasture keeps an open central grazing plane while tying the shade belt to the road.
place('water.trough.round.imagegen.v1',(1116,292),(61,40),'north-paddock-water')

# East grazing pocket sits beside a service track; its gate faces the access lane.
fence_run([(1272,496),(1319,472)],'east-paddock-boundary',flip='v')
fence_run([(1412,472),(1459,496)],'east-paddock-boundary')
fence_run([(1459,544),(1412,568)],'east-paddock-boundary',rotation=180)
fence_run([(1319,568),(1272,544)],'east-paddock-boundary',flip='v',rotation=180)
place('fence.gate.wood.imagegen.v1',(1225,542),(60,46),'east-paddock-gate')
place('water.trough.round.imagegen.v1',(1426,505),(62,41),'east-paddock-water')

# Riose equipment is placed at actual water/handling interfaces, not as decorative scatter.
place('technology.gateway.antenna.imagegen.v1',(1415,550),(47,74),'monitoring-node')
place('technology.monitor.station.imagegen.v1',(1284,632),(43,67),'monitoring-node')
place('technology.traceability.system.imagegen.v1',(1196,606),(49,52),'monitoring-node')
place('technology.reader.handheld.imagegen.v1',(1238,640),(35,43),'monitoring-node')

# Cattle are a deterministic visual sample by zone; no sprite stands for a real individual.
cattle=[
 ('livestock.nelore.adult.grazing.ne.v1',(500,305),(53,44),'west-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(554,288),(51,43),'west-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(588,320),(52,44),'west-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(523,348),(51,43),'west-pasture'),
 ('livestock.nelore.calf.idle.ne.v1',(574,357),(40,35),'west-pasture'),
 ('livestock.nelore.adult.grazing.ne.v1',(1039,278),(52,44),'north-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1090,256),(51,43),'north-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(1148,279),(52,44),'north-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1061,316),(51,43),'north-pasture'),
 ('livestock.nelore.calf.idle.ne.v1',(1133,325),(40,35),'north-pasture'),
 ('livestock.nelore.adult.grazing.ne.v1',(1352,495),(52,44),'east-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1406,479),(51,43),'east-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(1450,509),(52,44),'east-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1364,537),(51,43),'east-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1086,591),(51,43),'handling-core'),
 ('livestock.nelore.adult.walking.ne.v1',(1131,610),(51,43),'handling-core'),
]
for aid,xy,size,block in cattle: place(aid,xy,size,block)

# Tree masses act as a designed edge and grove, with open gaps framing entrances and views.
tree_groups={
 'north-edge':[((639,211),(69,84)),((704,192),(67,82)),((769,211),(68,83)),
               ((1243,220),(69,84)),((1227,241),(67,82))],
 'west-edge':[((111,470),(70,85)),((236,382),(65,80)),((270,501),(67,82))],
 'south-edge':[((760,700),(67,82)),((840,740),(67,82)),((1289,642),(70,85)),((1210,677),(68,83))],
 'grove':[((818,269),(65,80)),((881,248),(66,81)),((932,268),(65,80))],
}
for group,items in tree_groups.items():
    for xy,size in items: place('vegetation.tree.shade.imagegen.v2',xy,size,group)

# Grounding uses localized wear at the built nodes and service approaches.
overlays=[]
for center,size,opacity in [((855,399),(181,88),48),((1261,454),(210,97),54),
                            ((1111,665),(241,105),65),((523,579),(151,68),43),
                            ((1460,538),(142,65),43),((721,683),(132,66),36)]:
    overlays.append({'assetId':'terrain.soil.compacted-patch.imagegen.v2','centerPx':list(center),
      'renderSizePx':list(size),'opacity':opacity,'layer':'grounding'})

zones=[
 {'id':'cultivo','label':'CULTIVO','polygon':[[168,482],[458,326],[760,482],[458,638]]},
 {'id':'casa-sede','label':'CASA-SEDE','polygon':[[765,365],[860,320],[955,365],[860,410]]},
 {'id':'infraestrutura','label':'GALPÃO / SERVIÇOS','polygon':[[1162,432],[1284,374],[1406,432],[1284,490]]},
 {'id':'manejo','label':'CURRAL / MANEJO','polygon':[[1000,655],[1094,611],[1188,655],[1094,699]]},
 {'id':'agua','label':'ÁGUA','polygon':[[647,690],[724,654],[801,690],[724,726]]},
 {'id':'piquete-oeste','label':'PIQUETE OESTE','polygon':[[390,300],[535,228],[680,300],[535,372]]},
 {'id':'pasto-norte','label':'PASTO NORTE','polygon':[[977,300],[1089,248],[1201,300],[1089,352]]},
 {'id':'piquete-leste','label':'PIQUETE LESTE','polygon':[[1225,520],[1365,450],[1505,520],[1365,590]]},
 {'id':'borda-verde','label':'BORDA VERDE','polygon':[[576,216],[685,165],[794,216],[685,267]]},
 {'id':'monitoramento','label':'MONITORAMENTO','polygon':[[1198,672],[1291,629],[1384,672],[1291,715]]},
]

# Prefabs are spatial blocks, each placement owned once. Their offsets are stable/replayable.
prefab_specs=[
 ('homestead-block',['homestead','homestead-yard','homestead-water','homestead-grove'],[855,384],['casa-sede']),
 ('cultivation-block',['cultivation','crop-edge','cultivation-support'],[524,577],['cultivo']),
 ('service-yard-block',['service-yard','service-access','service-water','service-grove'],[1286,405],['infraestrutura']),
 ('handling-block',['handling-core','handling-support'],[1094,655],['manejo']),
 ('water-block',['water-block'],[717,686],['agua']),
 ('west-paddock-prefab',['west-paddock-boundary','west-paddock-gate','west-paddock-water','west-paddock-feed','west-pasture'],[535,300],['piquete-oeste']),
 ('north-pasture-prefab',['north-paddock-water','north-pasture'],[1089,300],['pasto-norte']),
 ('east-paddock-prefab',['east-paddock-boundary','east-paddock-gate','east-paddock-water','east-pasture'],[1365,520],['piquete-leste']),
 ('tree-belt-prefab',['north-edge','west-edge','south-edge','grove'],[887,430],['borda-verde']),
 ('monitoring-prefab',['monitoring-node'],[1291,672],['monitoramento']),
]
blocks={}
for item in placements: blocks.setdefault(item['block'],[]).append(item['placementId'])
prefabs=[]
for pid,names,origin,zids in prefab_specs:
    refs=[]
    for item in placements:
        if item['block'] in names:
            refs.append({'placementId':item['placementId'],
                         'offsetPx':[item['anchorPx'][0]-origin[0],item['anchorPx'][1]-origin[1]]})
    prefabs.append({'id':pid,'zoneIds':zids,'originPx':origin,'reusable':True,'placements':refs})

scene={
 'schemaVersion':1,'sceneId':'rural-diorama-composition-v4','projection':'isometric-2:1',
 'footprintPx':[W,H],
 'terrainPlate':'assets/candidates/terrain-family-v5/rural-diorama-ground-v2.png',
 'terrainAssetId':'terrain.ranch.complete-ground.imagegen.v2',
 'terrainMode':'unified-grass-dirt-crop-plate-with-local-grounding-overlays',
 'referenceRoles':{'urban':'composição, hierarquia, ritmo visual, footprint e coesão entre zonas',
   'fazendaV7':'conteúdo rural, organização, escala e densidade do território',
   'rioseV2':'transições do solo, grounding, uso localizado e vegetação controlada'},
 'visualAnimalBudget':{'mode':'sampled-miniature','visibleCount':len(cattle),
   'populationBinding':'none; deterministic lot-level visual sample, never scientific individual identities'},
 'visualAnimalLots':[
   {'id':'lot-west','realPopulation':None,'populationSource':'runtime-provided; not specified in this visual scene','zoneId':'piquete-oeste','operationalState':'grazing','maxSprites':5,'representationMode':'grouped','placementIds':[p['placementId'] for p in placements if p['block']=='west-pasture' and p['assetId'].startswith('livestock.')]},
   {'id':'lot-north','realPopulation':None,'populationSource':'runtime-provided; not specified in this visual scene','zoneId':'pasto-norte','operationalState':'grazing','maxSprites':5,'representationMode':'sampled-miniature','placementIds':[p['placementId'] for p in placements if p['block']=='north-pasture' and p['assetId'].startswith('livestock.')]},
   {'id':'lot-east','realPopulation':None,'populationSource':'runtime-provided; not specified in this visual scene','zoneId':'piquete-leste','operationalState':'grazing','maxSprites':4,'representationMode':'grouped','placementIds':[p['placementId'] for p in placements if p['block']=='east-pasture' and p['assetId'].startswith('livestock.')]},
   {'id':'lot-handling','realPopulation':None,'populationSource':'runtime-provided; not specified in this visual scene','zoneId':'manejo','operationalState':'handling','maxSprites':2,'representationMode':'operational','placementIds':[p['placementId'] for p in placements if p['block']=='handling-core' and p['assetId'].startswith('livestock.')]},
 ],
 'compositionBlocks':['homestead-block','cultivation-block','service-yard-block','handling-block',
   'water-block','west-paddock-prefab','north-pasture-prefab','east-paddock-prefab','tree-belt-prefab','monitoring-prefab'],
 'zones':zones,'groundingOverlays':overlays,'prefabs':prefabs,'placements':placements,
 'renderSettings':{'scale':1.0,'frameMarginX':60,'frameMarginTop':112,'frameBottomMargin':76,
   'backgroundRGB':[246,245,239],'title':'RIOSE · FAZENDA PECUÁRIA BRASILEIRA',
   'subtitle':'Diorama rural 2:1 · território por blocos · 16 bovinos representativos',
   'footer':'SEDE  ·  CULTIVO  ·  SERVIÇOS  ·  MANEJO  ·  PIQUETES  ·  ÁGUA  ·  MONITORAMENTO'},
 'compositionReview':{'status':'APPROVED','scope':'zone layout and composition of the ranch pilot only',
   'reviewer':'user','date':'2026-10-12','evidence':'Explicit user reply: "sim!" to approval of composition V4 as the pilot base.'},
 'assetReview':'unchanged; individual placement assets retain their manifest review statuses'
}
json_path=OUT/'rural-diorama-scene-v4.json'
json_path.write_text(json.dumps(scene,indent=2,ensure_ascii=False)+'\n')

# The blockout overlays the same real terrain plate and names zones, without making substitute art.
manifest=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
records={a['id']:a for a in manifest['assets']}
ground=Image.open(ROOT/records[scene['terrainAssetId']]['file']).convert('RGBA')
block=Image.new('RGBA',(W,H),(246,245,239,255)); block.alpha_composite(ground)
overlay=Image.new('RGBA',(W,H),(0,0,0,0)); draw=ImageDraw.Draw(overlay)
colors=[(183,132,72,91),(197,158,101,91),(132,128,110,94),(132,88,61,110),
 (70,143,164,110),(83,135,70,82),(76,128,63,80),(72,132,67,80),(65,121,69,76),(66,130,145,96)]
for z,color in zip(zones,colors): draw.polygon([tuple(p) for p in z['polygon']],fill=color,outline=(45,53,43,210),width=3)
block.alpha_composite(overlay); draw=ImageDraw.Draw(block)
for z in zones:
    pts=z['polygon']; xs=[p[0] for p in pts]; ys=[p[1] for p in pts]; label=z['label']; f=font(10,True)
    tw=draw.textbbox((0,0),label,font=f)[2]; cx=(min(xs)+max(xs))//2; cy=(min(ys)+max(ys))//2
    draw.rounded_rectangle((cx-tw//2-7,cy-12,cx+tw//2+7,cy+12),radius=5,fill=(248,247,241,236))
    draw.text((cx-tw//2,cy-9),label,font=f,fill=(38,47,40,255))
frame=Image.new('RGBA',(W+120,H+188),(246,245,239,255)); frame.alpha_composite(block,(60,112))
d=ImageDraw.Draw(frame)
d.text((38,24),'RIOSE · BLOCKOUT TERRITORIAL V4',font=font(25,True),fill=(38,47,40,255))
d.text((40,62),'Território organizado em células de pasto, núcleo da sede, cultivo, serviços e manejo conectados pelo caminho central.',font=font(14),fill=(80,87,78,255))
d.text((40,frame.height-38),'BLOCOS: SEDE / POMAR  →  CULTIVO  →  GALPÃO / SERVIÇO  →  MANEJO  ·  PASTOS EM MÓDULOS  ·  ÁGUA E TECNOLOGIA NOS PONTOS DE USO',font=font(11,True),fill=(80,87,78,255))
frame.convert('RGB').save(OUT/'rural-diorama-zone-blockout-v4.png',quality=96,optimize=True)

subprocess.run([sys.executable,str(ROOT/'scripts/assets/render_scene_json.py'),str(json_path),str(OUT/'rural-diorama-refined-v4.png')],check=True)
subprocess.run([sys.executable,str(ROOT/'scripts/assets/build_scene_contact_sheet.py'),'--scene',str(json_path),'--output',str(OUT/'asset-contact-sheet-v4.png'),'--columns','5'],check=True)

# Side-by-side plate keeps each source in the single role assigned by the brief.
comparison=Image.new('RGB',(1780,1210),(243,242,236)); cd=ImageDraw.Draw(comparison)
panels=[('URBANA · COMPOSIÇÃO',ROOT/'docs/assets/pixel-art-urban-reference.png','hierarquia, densidade e footprint'),
 ('FAZENDA V7 · CONTEÚDO / ESCALA',ROOT/'docs/assets/review-farm-pixel/fazenda-brasileira-completa-v7-candidata.png','organização e riqueza rural'),
 ('RIOSE V2 · TERRENO',ROOT/'assets/previews/pilot-v2/ranch-pilot-terrain-v3.png','transições e grounding'),
 ('RIOSE · SÍNTESE V4',OUT/'rural-diorama-refined-v4.png','composição rural por blocos')]
pw,ph=850,550
for i,(title,path,caption) in enumerate(panels):
    col=i%2; row=i//2; x=20+col*878; y=20+row*578
    im=Image.open(path).convert('RGBA'); avail=(pw-28,ph-106); s=min(avail[0]/im.width,avail[1]/im.height)
    im=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
    cd.rounded_rectangle((x,y,x+pw,y+ph),radius=15,fill=(255,255,252),outline=(195,193,184),width=2)
    cd.text((x+20,y+14),title,font=font(18,True),fill=(43,52,44))
    comparison.paste(im.convert('RGB'),(x+(pw-im.width)//2,y+45+(avail[1]-im.height)//2))
    cd.text((x+20,y+ph-43),caption,font=font(14),fill=(82,88,78))
comparison.save(OUT/'reference-role-comparison-v4.png',quality=94,optimize=True)

(OUT/'README.md').write_text('''# Riose rural diorama composition v4\n\nThis block-led composition is **approved by the user as the pilot composition base** (2026-10-12). Approval covers zone layout and composition only; it does not promote individual sprites or approve the overall art style. Earlier scenes remain untouched.\n\n- `rural-diorama-zone-blockout-v4.png`: zone distribution and prefab territory.\n- `rural-diorama-refined-v4.png`: scene rendered from JSON and manifest sprites.\n- `rural-diorama-scene-v4.json`: renderer-neutral scene source; 10 reusable prefabs, 10 zones, and 16 representative cattle.\n- `asset-contact-sheet-v4.png`: assets referenced by this composition and their current review states.\n- `reference-role-comparison-v4.png`: direct role-separated comparison with the urban, Fazenda V7, and Riose V2 references.\n\nReference roles stay separate: urban = composition grammar; Fazenda V7 = rural content, scale, and richness; Riose V2 = terrain transition, local wear, grounding, and controlled vegetation. Individual scientific records are not attached to group sprites. Individual asset statuses remain as recorded in the semantic manifest.\n\nRebuild with `python3 scripts/assets/compose_ranch_composition_v4.py`.\n''')
print(f'created {OUT}; placements={len(placements)}; zones={len(zones)}; prefabs={len(prefabs)}; cattle={len(cattle)}')
