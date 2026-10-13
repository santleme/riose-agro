#!/usr/bin/env python3
"""Compose a reference-led Riose rural diorama from existing image-library assets."""
from pathlib import Path
import json
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT=Path(__file__).resolve().parents[2]
MANIFEST=json.loads((ROOT/'assets/manifests/manifest.json').read_text())
RECORDS={a['id']:a for a in MANIFEST['assets']}
ASSETS={aid:ROOT/a['file'] for aid,a in RECORDS.items()}
OUT=ROOT/'assets/previews/ranch-composition-v1'; OUT.mkdir(parents=True,exist_ok=True)

def read(path):
    im=Image.open(path).convert('RGBA')
    alpha=im.getchannel('A'); bbox=alpha.point(lambda v:255 if v>=24 else 0).getbbox() or alpha.getbbox()
    return im.crop(bbox) if bbox else im

def fit(aid,box,flip=None,rotate=0):
    im=read(ASSETS[aid]); scale=min(box[0]/im.width,box[1]/im.height)
    im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.LANCZOS)
    if flip=='v': im=ImageOps.flip(im)
    elif flip=='h': im=ImageOps.mirror(im)
    if rotate: im=im.rotate(rotate,expand=True,resample=Image.Resampling.BICUBIC)
    return im

def font(size,bold=False):
    p='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    return ImageFont.truetype(p,size)

# Use the dedicated single-piece terrain composition: pasture, crop patch and access road
# already share one palette and transition language. It is not tiled or stretched.
GROUND_PATH=ROOT/'assets/candidates/terrain-family-v4/rural-diorama-ground-v1.png'
ground=Image.open(GROUND_PATH).convert('RGBA')
# Harden only nearly transparent generated edge pixels to suppress colored fringe, preserving the full coordinate canvas.
ga=ground.getchannel('A').point(lambda v:0 if v<24 else v)
ground.putalpha(ga)
W,H=ground.size
canvas=Image.new('RGBA',(W,H),(0,0,0,0)); canvas.alpha_composite(ground)

# Grouped, restrained grounding details under use zones.
overlay_records=[]
def overlay(aid,center,size,alpha):
    im=fit(aid,size)
    im.putalpha(im.getchannel('A').point(lambda v:round(v*alpha/255)))
    pos=(round(center[0]-im.width/2),round(center[1]-im.height/2))
    canvas.alpha_composite(im,pos)
    overlay_records.append({'assetId':aid,'centerPx':[round(center[0]),round(center[1])],
                            'renderSizePx':[im.width,im.height],'opacity':alpha,'layer':'grounding'})
overlay('terrain.soil.compacted-patch.imagegen.v2',(950,590),(230,116),90) # localized handling wear

# Queue all objects, then render by ground-contact Y for consistent isometric depth.
queue=[]; placement_records=[]
def queue_asset(aid,anchor,box,flip=None,rotate=0,group=None):
    im=fit(aid,box,flip,rotate)
    x,y=anchor; meta=RECORDS[aid]['anchor']
    pos=(round(x-meta['x']*im.width),round(y-meta['y']*im.height))
    queue.append((y,im,pos,aid))
    placement_records.append({'placementId':f'placement-{len(placement_records)+1:03d}',
                              'assetId':aid,'anchorPx':[round(x),round(y)],
                              'renderSizePx':[im.width,im.height],
                              'requestedSizePx':[int(box[0]),int(box[1])],
                              'anchorNormalized':[meta['x'],meta['y']],
                              'transform':{'flip':flip,'rotationDegreesCCW':rotate},
                              'depthKey':round(y,3),'block':group})
    return im

def fence_line(aid,points,box=(118,70),flip=None,rotate=0,group='paddock-fence'):
    for p in points: queue_asset(aid,p,box,flip,rotate,group)

# Back-to-front building blocks: separate, connected rural functions with two clear heroes.
queue_asset('building.shed.imagegen.v1',(1210,422),(224,166),group='service-and-shed')
queue_asset('building.workshop.imagegen.v1',(964,456),(178,137),group='service-and-shed')
queue_asset('building.farmhouse.imagegen.v2',(660,494),(275,182),group='headquarters')
queue_asset('water.pond.imagegen.v1',(360,622),(157,112),group='water')
queue_asset('water.reservoir.imagegen.v1',(1320,499),(92,88),group='water')
# green edge tree groups frame the footprint and bridge open zones
for pos,sz in [((226,520),(94,112)),((1514,499),(98,120)),((680,767),(78,95)),((1065,775),(78,96))]:
    queue_asset('vegetation.tree.shade.imagegen.v2',pos,sz,group='green-edge')
for pos,sz in [((690,350),(85,105)),((1165,340),(92,115)),((1290,300),(84,104))]:
    queue_asset('vegetation.tree.shade.imagegen.v2',pos,sz,group='shade-grove')
# one modular handling block between service access and paddocks
queue_asset('corral.wood.standard.imagegen.v1',(936,617),(210,150),group='handling-hub')
queue_asset('fence.gate.wood.imagegen.v1',(1037,654),(83,60),group='handling-hub')
queue_asset('handling.alley.cattle.imagegen.v1',(1088,677),(132,96),group='handling-hub')
queue_asset('water.trough.round.imagegen.v1',(812,678),(92,67),group='water-and-feed')
queue_asset('feed.trough.hay.imagegen.v1',(876,730),(104,60),group='water-and-feed')
queue_asset('vehicle.tractor.imagegen.v2',(635,717),(130,100),group='crop-and-machinery')
queue_asset('vehicle.livestock-truck.imagegen.v1',(792,556),(148,103),group='headquarters-and-access')
queue_asset('technology.scale.electronic.full.imagegen.v1',(1100,730),(92,80),group='handling-hub')
queue_asset('technology.gateway.antenna.imagegen.v1',(1315,550),(72,94),group='monitoring')
queue_asset('technology.monitor.station.imagegen.v1',(1375,595),(57,82),group='monitoring')

# Paddock prefab A: a complete small diamond enclosure along the lower-left pasture.
# Segment direction follows the two 2:1 isometric axes, not arbitrary rotations.
fence_line('fence.wire.wood-post.imagegen.v1',[(456,567),(568,529)],flip='v',group='paddock-west-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(651,535),(718,559)],group='paddock-west-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(708,584),(596,622)],rotate=180,group='paddock-west-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(515,615),(450,592)],flip='v',rotate=180,group='paddock-west-boundary')
# Paddock prefab B: smaller rotationally separated lot to the east, with service gate.
fence_line('fence.wire.wood-post.imagegen.v1',[(1098,578),(1182,549)],flip='v',group='paddock-east-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(1262,554),(1320,574)],group='paddock-east-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(1308,603),(1224,632)],rotate=180,group='paddock-east-boundary')
fence_line('fence.wire.wood-post.imagegen.v1',[(1157,624),(1102,605)],flip='v',rotate=180,group='paddock-east-boundary')
queue_asset('fence.gate.wood.imagegen.v1',(1108,614),(73,55),group='paddock-gate')

# Fourteen visually representative animals, grouped with deterministic positions.
# No sprite is assigned a scientific individual identity by this composition file.
cows=[
 ('livestock.nelore.adult.grazing.ne.v1',(509,607),(64,52),'paddock-west'),
 ('livestock.nelore.adult.idle.imagegen.v1',(566,589),(62,50),'paddock-west'),
 ('livestock.nelore.adult.walking.ne.v1',(618,617),(63,51),'paddock-west'),
 ('livestock.nelore.adult.grazing.ne.v1',(569,647),(62,50),'paddock-west'),

 ('livestock.nelore.adult.walking.ne.v1',(1143,601),(62,51),'paddock-east'),
 ('livestock.nelore.adult.grazing.ne.v1',(1196,584),(64,52),'paddock-east'),
 ('livestock.nelore.adult.idle.imagegen.v1',(1249,605),(61,50),'paddock-east'),
 ('livestock.nelore.adult.walking.ne.v1',(1197,641),(62,51),'paddock-east'),

 ('livestock.nelore.adult.idle.imagegen.v1',(868,633),(59,48),'handling-hub'),
 ('livestock.nelore.adult.walking.ne.v1',(910,652),(60,49),'handling-hub'),
 ('livestock.nelore.calf.idle.ne.v1',(1008,673),(46,40),'handling-hub'),
 ('livestock.nelore.adult.grazing.ne.v1',(800,270),(61,50),'north-pasture'),
 ('livestock.nelore.adult.idle.imagegen.v1',(858,293),(61,50),'north-pasture'),
 ('livestock.nelore.adult.walking.ne.v1',(1060,252),(61,50),'north-pasture'),
]
for aid,anchor,box,group in cows: queue_asset(aid,anchor,box,group=group)

# Back-to-front by anchor. Native sprites retain their authored contact shadows; no synthetic
# silhouette shadows or shape-built replacement art are added.
for _,im,pos,_ in sorted(queue,key=lambda item:item[0]): canvas.alpha_composite(im,pos)

# Editorial frame around the 2:1 world; the actual diorama artwork remains one continuous plate.
scale=1.06
scene=canvas.resize((round(W*scale),round(H*scale)),Image.Resampling.LANCZOS)
mx,mt=72,132; FW,FH=scene.width+2*mx,scene.height+mt+91
frame=Image.new('RGBA',(FW,FH),(246,245,239,255)); frame.alpha_composite(scene,(mx,mt))
d=ImageDraw.Draw(frame)
d.text((38,24),'RIOSE · FAZENDA PECUÁRIA BRASILEIRA',font=font(25,True),fill=(38,47,40,255))
d.text((40,62),'Diorama isométrico 2:1 · zonas conectadas · lote visual representativo: 14 bovinos',font=font(15),fill=(80,87,78,255))
d.text((40,FH-39),'SEDE  ·  MANEJO  ·  SERVIÇOS  ·  ÁGUA  ·  CULTIVO  ·  PIQUETES  ·  MONITORAMENTO',font=font(14,True),fill=(80,87,78,255))
frame.convert('RGB').save(OUT/'rural-diorama-refined-v1.png',quality=96,optimize=True)

# Zone blockout uses broad polygons only as an authoring diagram, over the identical terrain plate.
block=Image.new('RGBA',(W,H),(0,0,0,0)); block.alpha_composite(ground)
layer=Image.new('RGBA',(W,H),(0,0,0,0)); ld=ImageDraw.Draw(layer)
zones=[
 {'id':'cultivo','label':'CULTIVO','polygon':[(135,382),(401,268),(584,386),(318,504)],'color':(170,122,72,112)},
 {'id':'casa-sede','label':'CASA-SEDE','polygon':[(508,418),(659,352),(812,417),(660,483)],'color':(207,165,101,120)},
 {'id':'agua','label':'ÁGUA','polygon':[(268,569),(356,521),(450,570),(360,620)],'color':(76,148,172,138)},
 {'id':'manejo','label':'CURRAL / MANEJO','polygon':[(827,574),(936,529),(1046,576),(937,621)],'color':(142,95,67,136)},
 {'id':'galpao-servicos','label':'GALPÃO / SERVIÇOS','polygon':[(1090,385),(1216,329),(1343,379),(1218,436)],'color':(126,124,108,130)},
 {'id':'piquetes','label':'PIQUETES','polygon':[(1084,615),(1212,557),(1358,613),(1227,672)],'color':(94,139,73,105)},
 {'id':'pastagem','label':'PASTAGEM','polygon':[(425,628),(571,566),(718,626),(573,687)],'color':(90,143,70,105)},
 {'id':'pasto-sombreado','label':'PASTO / SOMBRA','polygon':[(716,398),(878,331),(1046,395),(881,463)],'color':(90,143,70,105)},
 {'id':'monitoramento','label':'MONITORAMENTO','polygon':[(1250,569),(1327,536),(1405,569),(1328,603)],'color':(75,131,143,136)},
]
for z in zones: ld.polygon(z['polygon'],fill=z['color'],outline=(44,53,44,225),width=3)
block.alpha_composite(layer); bd=ImageDraw.Draw(block)
for z in zones:
    xs=[p[0] for p in z['polygon']]; ys=[p[1] for p in z['polygon']]
    label=z['label']; f=font(13,True); tw=bd.textbbox((0,0),label,font=f)[2]
    cx=(min(xs)+max(xs))//2; cy=(min(ys)+max(ys))//2
    bd.rounded_rectangle((cx-tw//2-7,cy-12,cx+tw//2+7,cy+13),radius=5,fill=(248,247,241,235))
    bd.text((cx-tw//2,cy-9),label,font=f,fill=(38,47,40,255))
block=block.resize((round(W*scale),round(H*scale)),Image.Resampling.LANCZOS)
bf=Image.new('RGBA',(FW,FH),(246,245,239,255)); bf.alpha_composite(block,(mx,mt)); bd=ImageDraw.Draw(bf)
bd.text((38,24),'RIOSE · BLOCKOUT DE ZONAS',font=font(25,True),fill=(38,47,40,255))
bd.text((40,62),'A estrada organiza o percurso entre cultivo, sede, manejo, serviços e piquetes; água e tecnologia fecham a malha.',font=font(15),fill=(80,87,78,255))
bd.text((40,FH-39),'SEQUÊNCIA DE BLOCOS: CULTIVO → SEDE → MANEJO → PIQUETES / MONITORAMENTO',font=font(14,True),fill=(80,87,78,255))
bf.convert('RGB').save(OUT/'rural-diorama-zone-blockout-v1.png',quality=96,optimize=True)

scene_data={
 'schemaVersion':1,'sceneId':'rural-diorama-composition-v1','projection':'isometric-2:1','footprintPx':[W,H],
 'terrainPlate':'assets/candidates/terrain-family-v4/rural-diorama-ground-v1.png',
 'terrainAssetId':'terrain.ranch.complete-ground.imagegen.v1',
 'terrainMode':'single-authored-plate-with-integrated-grass-dirt-crop-transitions',
 'groundingOverlays':overlay_records,
 'renderSettings':{'scale':1.06,'frameMarginX':72,'frameMarginTop':132,'frameBottomMargin':91,
                   'backgroundRGB':[246,245,239],
                   'title':'RIOSE · FAZENDA PECUÁRIA BRASILEIRA',
                   'subtitle':'Diorama isométrico 2:1 · zonas conectadas · lote visual representativo: 14 bovinos',
                   'footer':'SEDE  ·  MANEJO  ·  SERVIÇOS  ·  ÁGUA  ·  CULTIVO  ·  PIQUETES  ·  MONITORAMENTO'},
 'referenceRoles':{'urban':'composição, hierarquia, leitura de zonas e footprint do diorama','fazendaV7':'conteúdo rural, escala e densidade da fazenda','rioseV2':'transições do terreno, vegetação controlada e grounding'},
 'zones':zones,
 'visualAnimalBudget':{'mode':'sampled-miniature','visibleCount':len(cows),'populationBinding':'none; grouped sprites depict a representative lot, not identified scientific individuals'},
 'compositionBlocks':['crop-block','headquarters-block','handling-block','water-block','paddock-block','service-and-technology-block','green-edge-block'],
 'prefabs':[],
 'placements':placement_records,
 'artReview':'candidate for human visual approval; original library review and rights statuses remain unchanged'
}
prefab_specs=[
 {'id':'headquarters-and-access','zoneIds':['casa-sede'],'originPx':[660,500],'blocks':['headquarters','headquarters-and-access']},
 {'id':'service-yard','zoneIds':['galpao-servicos'],'originPx':[1080,440],'blocks':['service-and-shed']},
 {'id':'water-and-feed','zoneIds':['agua','pastagem'],'originPx':[780,690],'blocks':['water','water-and-feed']},
 {'id':'cultivated-field-service','zoneIds':['cultivo'],'originPx':[635,717],'blocks':['crop-and-machinery'],'terrainFeatures':['cultivo']},
 {'id':'handling-and-scale','zoneIds':['manejo'],'originPx':[1010,660],'blocks':['handling-hub']},
 {'id':'west-paddock','zoneIds':['pastagem'],'originPx':[590,600],'blocks':['paddock-west','paddock-west-boundary']},
 {'id':'east-paddock','zoneIds':['piquetes'],'originPx':[1220,600],'blocks':['paddock-east','paddock-east-boundary','paddock-gate']},
 {'id':'rural-monitoring-node','zoneIds':['monitoramento'],'originPx':[1345,575],'blocks':['monitoring']},
 {'id':'green-edge-grove','zoneIds':['pastagem','piquetes'],'originPx':[880,600],'blocks':['green-edge']},
 {'id':'north-shade-pasture','zoneIds':['pasto-sombreado'],'originPx':[900,400],'blocks':['shade-grove','north-pasture']},
]
for prefab in prefab_specs:
 refs=[]
 for item in placement_records:
  if item.get('block') in prefab['blocks']:
   refs.append({'placementId':item['placementId'],'offsetPx':[item['anchorPx'][0]-prefab['originPx'][0],item['anchorPx'][1]-prefab['originPx'][1]]})
 prefab['placements']=refs
 prefab['reusable']=True
scene_data['prefabs']=prefab_specs
(OUT/'rural-diorama-scene-v1.json').write_text(json.dumps(scene_data,indent=2,ensure_ascii=False)+'\n')
# The renderer consumes the saved, renderer-neutral scene JSON. The authoring script above
# defines a scene recipe; the JSON is the reproducible input used for the final image export.
subprocess.run([sys.executable,str(ROOT/'scripts/assets/render_scene_json.py'),
                str(OUT/'rural-diorama-scene-v1.json'),
                str(OUT/'rural-diorama-refined-v1.png')],check=True)
print(f'created {OUT}; footprint={W}x{H}; placements={len(placement_records)}; visualCattle={len(cows)}')
