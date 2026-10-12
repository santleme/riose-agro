#!/usr/bin/env python3
"""Crop generated transparent sheets, preserve soft alpha, pack atlases and register candidates."""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[2]
SEMANTIC = ROOT / 'assets/manifests/manifest.json'
RUNTIME = ROOT / 'public/assets/manifest.json'
OUT = ROOT / 'assets/candidates'
ATLAS_DIR = ROOT / 'public/assets/atlas'
ICC = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()

# Each sheet is authored as distinct objects on transparency. Components are ordered by rows then columns.
GROUPS = {
 'animals': [
  ('livestock','nelore-cow-generated-original-v1.png',None,'livestock.nelore.cow.idle.imagegen.v1','Vaca Nelore','nelore-cattle',['nelore','cow','adult','idle']),
  ('livestock','nelore-calf-generated-original-v1.png',None,'livestock.nelore.calf.idle.imagegen.v1','Bezerro Nelore','nelore-cattle',['nelore','calf','idle']),
  ('livestock','nelore-heifer-generated-original-v1.png',None,'livestock.nelore.heifer.idle.imagegen.v1','Novilha Nelore','nelore-cattle',['nelore','heifer','idle']),
  ('livestock','nelore-bull-generated-original-v1.png',None,'livestock.nelore.bull.idle.imagegen.v1','Touro Nelore','nelore-cattle',['nelore','bull','idle']),
  ('livestock','angus-cow-generated-original-v1.png',None,'livestock.angus.cow.idle.imagegen.v1','Vaca Angus','angus-cattle',['angus','cow','adult','idle']),
  ('livestock','crossbred-cow-generated-original-v1.png',None,'livestock.crossbred.cow.idle.imagegen.v1','Vaca cruzada','crossbred-cattle',['crossbred','cow','adult','idle']),
 ],
 'handling': [
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',0,'corral.wood.standard.imagegen.v1','Curral de madeira','corral',['corral','wood','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',1,'handling.chute.cattle.imagegen.v1','Brete de manejo','corral',['chute','handling','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',2,'handling.alley.cattle.imagegen.v1','Corredor de manejo','corral',['alley','handling','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',3,'fence.gate.wood.imagegen.v1','Porteira de madeira','fence',['gate','wood','modular']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',4,'fence.wire.wood-post.imagegen.v1','Cerca de arame e madeira','fence',['fence','wire','modular']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',5,'feed.trough.hay.imagegen.v1','Cocho de feno','feed',['hay','trough','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',6,'water.trough.round.imagegen.v1','Bebedouro circular','water',['water','trough','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',7,'feed.salt.roofed.imagegen.v1','Saleiro coberto','feed',['salt','feeder','cattle']),
  ('handling','livestock-handling-props-sheet-imagegen-v1.png',8,'technology.scale.electronic.imagegen.v1','Balança eletrônica','technology',['scale','electronic','cattle']),
 ],
 'environment': [
  ('environment','riose-environment-atlas-imagegen-v1.png',0,'pasture.grass.native.imagegen.v1','Pastagem com vegetação','pasture',['pasture','grass','tile']),
  ('environment','riose-environment-atlas-imagegen-v1.png',1,'terrain.soil.dry.imagegen.v1','Terra seca','pasture',['soil','dry','terrain']),
  ('environment','riose-environment-atlas-imagegen-v1.png',2,'terrain.mud.imagegen.v1','Lama de curral','pasture',['mud','wet','terrain']),
  ('environment','riose-environment-atlas-imagegen-v1.png',3,'water.pond.imagegen.v1','Açude','water',['pond','water','shoreline']),
  ('environment','riose-environment-atlas-imagegen-v1.png',4,'water.reservoir.imagegen.v1','Reservatório rural','water',['reservoir','water','farm']),
  ('environment','riose-environment-atlas-imagegen-v1.png',5,'road.rural.dirt.imagegen.v1','Estrada rural de terra','infrastructure',['road','dirt','rural']),
  ('environment','riose-environment-atlas-imagegen-v1.png',6,'vegetation.tree.shade.imagegen.v1','Árvore de sombra','vegetation',['tree','shade','rural']),
 ],
 'infrastructure': [
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',0,'building.farmhouse.imagegen.v1','Sede rural','building',['farmhouse','brazil','rural']),
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',1,'building.shed.imagegen.v1','Galpão rural','building',['shed','barn','rural']),
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',2,'building.workshop.imagegen.v1','Oficina e depósito','building',['workshop','storage','rural']),
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',3,'vehicle.pickup.rural.imagegen.v1','Caminhonete rural','vehicle',['pickup','rural','utility']),
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',4,'vehicle.livestock-truck.imagegen.v1','Caminhão boiadeiro','vehicle',['livestock-truck','transport','rural']),
  ('infrastructure','riose-farm-infrastructure-atlas-imagegen-v1.png',5,'vehicle.tractor.imagegen.v1','Trator agrícola','vehicle',['tractor','farm','rural']),
 ],
 'technology': [
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',0,'technology.ear-tag.rfid.imagegen.v1','Brinco inteligente RFID','technology',['rfid','ear-tag','livestock']),
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',1,'technology.reader.handheld.imagegen.v1','Leitor portátil','technology',['reader','rfid','handheld']),
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',2,'technology.gateway.antenna.imagegen.v1','Gateway e antena rural','technology',['gateway','antenna','iot']),
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',3,'technology.monitor.station.imagegen.v1','Estação de monitoramento','technology',['monitoring','station','weather']),
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',4,'technology.scale.electronic.full.imagegen.v1','Balança eletrônica de curral','technology',['scale','electronic','livestock']),
  ('technology','riose-traceability-tech-atlas-imagegen-v1.png',5,'technology.traceability.system.imagegen.v1','Infraestrutura de rastreabilidade','technology',['traceability','gateway','livestock']),
 ],
}
SOURCES = {
 'livestock': ROOT/'assets/source/livestock',
 'handling': ROOT/'assets/source/handling',
 'environment': ROOT/'assets/source/environment',
 'infrastructure': ROOT/'assets/source/infrastructure',
 'technology': ROOT/'assets/source/technology',
}

def sha(path: Path) -> str:
 return hashlib.sha256(path.read_bytes()).hexdigest()

def find_components(image: Image.Image):
 rgba=np.array(image.convert('RGBA'))
 alpha=rgba[:,:,3]
 n, labels, stats, _=cv2.connectedComponentsWithStats((alpha>32).astype(np.uint8),8)
 comps=[]
 for i in range(1,n):
  x,y,w,h,area=map(int,stats[i])
  if area>200: comps.append((y,x,i,(x,y,w,h)))
 comps.sort()
 return rgba, comps, labels

def bleed_rgb(im: Image.Image, radius=4):
 rgba=np.array(im.convert('RGBA'))
 alpha=rgba[:,:,3]
 mask=(alpha>0).astype(np.uint8)
 if mask.max()==0:return im
 # Extend edge RGB only into fully transparent padding to prevent texture filtering halos.
 colors=rgba[:,:,:3].copy()
 for _ in range(radius):
  grown=cv2.dilate(mask,np.ones((3,3),np.uint8),iterations=1)
  next_colors=cv2.dilate(colors,np.ones((3,3),np.uint8),iterations=1)
  fill=(mask==0)&(grown>0)
  colors[fill]=next_colors[fill]
  mask=grown
 rgba[:,:,:3]=colors
 return Image.fromarray(rgba,'RGBA')

def semantic_category(group_id: str, aid: str) -> str:
 if group_id=='animals': return 'livestock'
 if group_id=='handling':
  if aid.startswith('corral.') or aid.startswith('handling.'): return 'corral'
  if aid.startswith('fence.'): return 'fence'
  if aid.startswith('feed.'): return 'feed'
  if aid.startswith('water.'): return 'water'
  return 'technology'
 if group_id=='environment':
  if aid.startswith('pasture.') or aid.startswith('terrain.'): return 'pasture'
  if aid.startswith('water.'): return 'water'
  if aid.startswith('road.'): return 'infrastructure'
  return 'vegetation'
 if group_id=='infrastructure':
  return 'building' if aid.startswith('building.') else 'vehicle'
 return 'technology'

def clean_crop(src: Path, component_index: int | None, output: Path):
 raw=Image.open(src).convert('RGBA')
 rgba,components,labels=find_components(raw)
 sheet=src.parent.name
 thresholds={'environment':(350,), 'handling':(350,650), 'infrastructure':(500,), 'technology':(500,)}.get(sheet,())
 if thresholds:
  def row_key(item):
   y,x=item[0],item[1]
   return (sum(y>=threshold for threshold in thresholds),x)
  components.sort(key=row_key)
 if component_index is None:
  selected=max(components,key=lambda item:item[3][2]*item[3][3])
 else:
  if component_index>=len(components): raise ValueError(f'{src}: requested component {component_index}, found {len(components)}')
  selected=components[component_index]
 label_id=selected[2]
 x,y,w,h=selected[3]
 pad=8
 x0=max(0,x-pad); y0=max(0,y-pad); x1=min(raw.width,x+w+pad); y1=min(raw.height,y+h+pad)
 crop=raw.crop((x0,y0,x1,y1))
 a=np.array(crop.getchannel('A'))
 component_crop=labels[y0:y1,x0:x1]
 distance=cv2.distanceTransform((component_crop!=label_id).astype(np.uint8),cv2.DIST_L2,5)
 # Retain the selected prop and its immediate antialias/shadow edge; discard neighboring components.
 a[(component_crop!=label_id)&(distance>4)]=0
 a[a<8]=0
 a[a>240]=255
 crop.putalpha(Image.fromarray(a,'L'))
 crop=bleed_rgb(crop,4)
 output.parent.mkdir(parents=True,exist_ok=True)
 crop.save(output,optimize=True,icc_profile=ICC)
 return crop

def pack_group(group_id, records):
 atlas_w=3072 if group_id=='animals' else 2048
 pad=8; x=pad; y=pad; row_h=0; placements=[]
 entries=sorted(records,key=lambda item:(-item['image'].height,-item['image'].width,item['id']))
 for item in entries:
  im=item['image']
  if im.width+2*pad>atlas_w: raise ValueError(f"asset too wide for atlas: {item['id']} {im.size}")
  if x+im.width+pad>atlas_w:
   x=pad;y+=row_h+pad;row_h=0
  placements.append((item,x,y))
  x+=im.width+pad;row_h=max(row_h,im.height)
 atlas_h=max(1024,math.ceil((y+row_h+pad)/128)*128)
 atlas=Image.new('RGBA',(atlas_w,atlas_h),(0,0,0,0))
 frame_map={}
 for item,x,y in placements:
  atlas.alpha_composite(item['image'],(x,y))
  frame_map[item['id']]={'x':x,'y':y,'w':item['image'].width,'h':item['image'].height}
 path=ATLAS_DIR/f'{group_id}-review-atlas-v1.png'
 atlas.save(path,optimize=True,icc_profile=ICC)
 return path,atlas.size,frame_map

def main():
 semantic=json.loads(SEMANTIC.read_text()); runtime=json.loads(RUNTIME.read_text())
 known={a['id'] for a in semantic['assets']}
 runtime_known={a['id'] for a in runtime['assets']}
 for group_id, entries in GROUPS.items():
  records=[]
  for category, filename, component, aid, name, family, tags in entries:
   src=SOURCES[category]/filename
   if not src.is_file(): raise FileNotFoundError(src)
   out=OUT/category/(aid.replace('.','-')+'.png')
   img=clean_crop(src,component,out)
   records.append({'id':aid,'name':name,'category':semantic_category(group_id,aid),'family':family,'tags':tags,'source':src,'file':out,'image':img})
  atlas_path, atlas_size, frames=pack_group(group_id,records)
  runtime['atlases'][f'{group_id}-review']={'image':'/assets/atlas/'+atlas_path.name,'cellLayout':'free-rects','sourceSize':list(atlas_size)}
  for item in records:
   aid=item['id']; out=item['file']; src=item['source']; im=item['image']; frame=frames[aid]
   record={
      'id':aid,'name':item['name'],'category':item['category'],'family':item['family'],'file':out.relative_to(ROOT).as_posix(),
      'source':{'kind':'ai-generated','tool':'OpenAI ImageGen built-in','modelVersion':None,'sourceFile':src.relative_to(ROOT).as_posix(),'promptFile':None,'createdAt':'2026-10-12','sha256':sha(src)},
      'dimensions':{'width':im.width,'height':im.height,'format':'PNG','alpha':True},'footprint':[1,1],
      'anchor':{'x':0.5,'y':1,'meaning':'ground-contact'},'tags':item['tags'],'states':['idle'] if item['category']=='livestock' else [],
      'scenarioCompatibility':['extensive-cattle','mixed','demo-premium'],'styleVersion':'riose-livestock-v1-candidate','status':'REVIEW',
      'references':['urban-isometric-master-2026-10','brazilian-farm-v7-approved-scene','approved-imagegen-nelore-v1'],
      'rights':{'licenseState':'project-generated-review','notes':'Generated with built-in OpenAI ImageGen for Riose internal asset development; preserve raw source; art is pending review.'},
      'atlas':None,'review':{'art':'pending','technical':'pass','decisionNote':'Generated candidate. Alpha cleaned with a low-end cutoff and crop-only sprite preparation; raw ImageGen source preserved separately.'},
      'notes':'Candidate asset packed in the category review atlas; not yet art-approved.','description':item['name'],
      'materials':['illustrated farm materials'],'orientations':['three-quarter isometric view'],'assetVersion':'v1-candidate',
      'regionalCompatibility':['Brazil-general'],'distributionPackage':group_id,'frames':[],
      'history':[{'event':'generated-and-packaged-for-review','date':'2026-10-12','detail':'Original retained; per-sprite PNG and category atlas produced for progressive integration.'}],
      'colorProfile':'embedded-srgb','technicalPolicy':{'alphaMode':'soft-alpha-sprite','paddingMinPx':2},'fileSha256':sha(out)
    }
   existing=next((a for a in semantic['assets'] if a.get('id')==aid),None)
   if existing is None: semantic['assets'].append(record)
   else: existing.update(record)
   runtime_asset={'id':aid.replace('.','-'),'category':item['category'],'file':'/assets/atlas/'+atlas_path.name,
      'frame':{'atlas':f'{group_id}-review','x':frame['x'],'y':frame['y'],'w':frame['w'],'h':frame['h']},
      'anchor':{'x':0.5,'y':1},'footprint':[1,1],'tags':item['tags'],
      'scenarioCompatibility':['extensive-cattle','mixed','demo-premium'],'randomVariants':[],
      'scaleHints':{'min':0.08,'default':0.22,'max':0.4},'collision':None}
   old_runtime=next((a for a in runtime['assets'] if a.get('id')==runtime_asset['id']),None)
   if old_runtime is None: runtime['assets'].append(runtime_asset)
   else: old_runtime.update(runtime_asset)
 semantic['status']='library-in-progress'
 semantic['notes']='First user-approved ImageGen Nelore is integrated; additional generated assets are progressively packaged in category review atlases and remain art-pending until approved.'
 SEMANTIC.write_text(json.dumps(semantic,indent=2,ensure_ascii=False)+'\n')
 RUNTIME.write_text(json.dumps(runtime,indent=2,ensure_ascii=False)+'\n')
 for group_id in GROUPS:
  p=ATLAS_DIR/f'{group_id}-review-atlas-v1.png'
  print(group_id,p.relative_to(ROOT),Image.open(p).size)
 print(f"registered {len(semantic['assets'])} semantic assets and {len(runtime['assets'])} runtime frames")

if __name__=='__main__': main()
