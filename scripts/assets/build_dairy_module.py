#!/usr/bin/env python3
"""Prepare isolated PNGs and a module-local atlas from preserved dairy ImageGen sheets."""
from __future__ import annotations
import hashlib, json, math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageCms

ROOT=Path(__file__).resolve().parents[2]
MODULE=ROOT/'assets/modules/livestock-dairy'
PUBLIC=ROOT/'public/assets/modules/livestock-dairy'
ICC=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
# Sources are preserved as generated; order is top-to-bottom, left-to-right among isolated subjects.
SHEETS={
 'infrastructure':{
  'source':MODULE/'source/infrastructure/dairy-infrastructure-sheet-imagegen-v1.png',
  'items':[
   ('dairy-milking-parlor','Sala de ordenha','dairy-infrastructure',['dairy','milking','parlor']),
   ('dairy-milk-chilling-tank','Tanque de resfriamento de leite','dairy-infrastructure',['dairy','milk','cooling-tank']),
   ('dairy-waiting-pen','Curral de espera da ordenha','dairy-infrastructure',['dairy','waiting-pen','corral']),
   ('dairy-barn','Galpão leiteiro','dairy-infrastructure',['dairy','barn','free-stall']),
  ]},
 'animals':{
  'source':[
   MODULE/'source/animals/holstein-cow-imagegen-original-v1.png',
   MODULE/'source/animals/girolando-cow-imagegen-original-v1.png',
   MODULE/'source/animals/dairy-heifer-imagegen-original-v1.png',
   MODULE/'source/animals/dairy-heifer-calf-imagegen-original-v1.png',
  ],
  'items':[
   ('dairy-holstein-cow','Vaca Holandesa','livestock-dairy-core',['dairy','holstein','cow','adult']),
   ('dairy-girolando-cow','Vaca Girolando','livestock-dairy-core',['dairy','girolando','cow','adult']),
   ('dairy-heifer','Novilha leiteira','livestock-dairy-core',['dairy','heifer']),
   ('dairy-heifer-calf','Bezerra leiteira','livestock-dairy-core',['dairy','calf']),
  ]},
 'technology':{
  'source':MODULE/'source/technology/activity-rumination-collar-imagegen-v1.png',
  'items':[
   ('dairy-activity-collar','Coleira com sensor de atividade/ruminação','dairy-technology',['dairy','sensor','activity','rumination','collar']),
  ]},
}

def sha(p:Path)->str:return hashlib.sha256(p.read_bytes()).hexdigest()
def bleed(im:Image.Image,radius=4)->Image.Image:
 a=np.array(im.convert('RGBA')); mask=(a[:,:,3]>0).astype(np.uint8); rgb=a[:,:,:3].copy()
 for _ in range(radius):
  grown=cv2.dilate(mask,np.ones((3,3),np.uint8),iterations=1)
  spread=cv2.dilate(rgb,np.ones((3,3),np.uint8),iterations=1)
  fill=(mask==0)&(grown>0); rgb[fill]=spread[fill]; mask=grown
 a[:,:,:3]=rgb
 return Image.fromarray(a,'RGBA')
def components(im:Image.Image):
 a=np.array(im.convert('RGBA')); alpha=a[:,:,3]
 n,labels,stats,_=cv2.connectedComponentsWithStats((alpha>32).astype(np.uint8),8)
 found=[]
 for i in range(1,n):
  x,y,w,h,area=map(int,stats[i])
  if area>400: found.append((y,x,i,(x,y,w,h)))
 found.sort(key=lambda v:(int((v[0]+v[3][3]/2)>=im.height/2),v[1]))
 return a,labels,found
def crop_component(source:Path,index:int,dest:Path)->Image.Image:
 raw=Image.open(source).convert('RGBA'); a,labels,found=components(raw)
 if len(found)!=4 and source.name.startswith('dairy-infrastructure'):
  pass
 if index>=len(found): raise ValueError(f'{source}: needs component {index}, found {len(found)}')
 _,_,label_id,(x,y,w,h)=found[index]
 pad=8;x0=max(0,x-pad);y0=max(0,y-pad);x1=min(raw.width,x+w+pad);y1=min(raw.height,y+h+pad)
 rgba=a[y0:y1,x0:x1].copy(); own=labels[y0:y1,x0:x1]==label_id
 al=rgba[:,:,3]
 # Drop low alpha from detached backdrop; retain soft edges/shadow attached to the subject.
 al[~own & (al>0)]=0
 al[al<4]=0; al[al>=250]=255
 rgba[:,:,3]=al
 im=bleed(Image.fromarray(rgba,'RGBA'))
 dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest,optimize=True,icc_profile=ICC)
 return im

def pack(records):
 maxw=2048;pad=8;x=pad;y=pad;rowh=0;placements=[]
 for r in sorted(records,key=lambda q:(-q['image'].height,-q['image'].width,q['id'])):
  im=r['image']
  if x+im.width+pad>maxw:x=pad;y+=rowh+pad;rowh=0
  placements.append((r,x,y));x+=im.width+pad;rowh=max(rowh,im.height)
 h=max(512,math.ceil((y+rowh+pad)/128)*128)
 atlas=Image.new('RGBA',(maxw,h),(0,0,0,0));frames={}
 for r,x,y in placements:
  atlas.alpha_composite(r['image'],(x,y));frames[r['id']]={'x':x,'y':y,'w':r['image'].width,'h':r['image'].height}
 PUBLIC.mkdir(parents=True,exist_ok=True);path=PUBLIC/'dairy-assets-atlas-v1.png';atlas.save(path,optimize=True,icc_profile=ICC)
 return path,atlas.size,frames

def main():
 records=[]
 for category,cfg in SHEETS.items():
  sources=cfg['source'] if isinstance(cfg['source'],list) else [cfg['source']]
  if len(sources) not in (1,len(cfg['items'])):raise ValueError(f'{category}: source/item count differs')
  for idx,(rid,name,family,tags) in enumerate(cfg['items']):
   src=sources[idx] if len(sources)>1 else sources[0]
   if not src.exists():continue
   component=0 if len(sources)>1 else idx
   out=MODULE/'assets'/category/(rid+'.png');im=crop_component(src,component,out)
   records.append({'id':rid,'name':name,'category':category,'family':family,'tags':tags,'source':src,'file':out,'image':im})
 if not records:raise SystemExit('No dairy ImageGen sources found yet')
 atlas,size,frames=pack(records)
 shared={
  'feed-trough-wood':'feed-trough-hay-imagegen-v1','water-trough-round':'water-trough-round-imagegen-v1',
  'fence-wood-wire-straight':'fence-wire-wood-post-imagegen-v1','dairy-gateway':'technology-gateway-antenna-imagegen-v1',
  'electronic-ear-tag':'technology-ear-tag-rfid-imagegen-v1','rfid-reader':'technology-reader-handheld-imagegen-v1',
 }
 runtime={'schemaVersion':1,'moduleId':'livestock-dairy','moduleVersion':'0.1.0','styleVersion':'riose-livestock-v1-candidate','status':'candidate-integration',
  'atlases':{'dairy-assets-v1':{'image':'/assets/modules/livestock-dairy/dairy-assets-atlas-v1.png','cellLayout':'free-rects','sourceSize':list(size)}},
  'assets':[],'sharedAssets':[]}
 for r in records:
  f=frames[r['id']]
  runtime['assets'].append({'id':r['id'],'semanticId':('dairy.'+r['id'].removeprefix('dairy-').replace('-','.'))+'.imagegen.v1','category':'livestock' if r['category']=='animals' else ('technology' if r['category']=='technology' else 'building'),'family':r['family'],'file':'/assets/modules/livestock-dairy/dairy-assets-atlas-v1.png','frame':{'atlas':'dairy-assets-v1',**f},'sourceFile':r['source'].relative_to(ROOT).as_posix(),'sourceSha256':sha(r['source']),'spriteFile':r['file'].relative_to(ROOT).as_posix(),'spriteSha256':sha(r['file']),'dimensions':[r['image'].width,r['image'].height],'alpha':True,'anchor':{'x':0.5,'y':1,'meaning':'ground-contact'},'footprint':[2,2] if r['family']=='dairy-infrastructure' else [1,1],'tags':r['tags'],'status':'REVIEW','review':{'art':'pending','technical':'pass','decisionNote':'ImageGen candidate; original preserved, sprite cropped from isolated component, alpha cleaned with soft edges retained.'}})
 for module_id,runtime_id in shared.items():runtime['sharedAssets'].append({'id':module_id,'runtimeAssetId':runtime_id,'resolution':'public/assets/manifest.json','duplicatesPng':False})
 (PUBLIC/'manifest.json').write_text(json.dumps(runtime,indent=2,ensure_ascii=False)+'\n')
 print(f'Built {len(records)} local sprites from {len({r["source"] for r in records})} sources; atlas {size}.')
 for r in records:print(r['id'],r['image'].size,r['file'].relative_to(ROOT))
if __name__=='__main__':main()
