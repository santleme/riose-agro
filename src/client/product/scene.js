import {PRODUCT_BLOCKOUT, PRODUCT_WORLD, PRODUCT_PREFABS, worldToScreen, screenToWorld, animalWorldPosition, separateAnimalVisuals} from './spatial.js';
import {productSceneGeometry} from './scene-geometry.js';

export const PRODUCT_SCENE_SIZE=Object.freeze({width:800,height:416});
export const PRODUCT_TILE=PRODUCT_WORLD.tile;
export const PRODUCT_SCENE_PREFABS=PRODUCT_PREFABS;
const corners=(x,y,w,h)=>[worldToScreen(x,y),worldToScreen(x+w,y),worldToScreen(x+w,y+h),worldToScreen(x,y+h)];
const geometry=productSceneGeometry();
function path(ctx,points,fill,stroke=null,width=1){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function drawTerrain(ctx){
  const top=geometry.outline;
  for(const edge of geometry.frontEdges){
    const d=PRODUCT_WORLD.soilDepth,shade=edge.shade==='side'?'#765039':'#8d6040';
    path(ctx,[edge.from,edge.to,{x:edge.to.x,y:edge.to.y+d},{x:edge.from.x,y:edge.from.y+d}],shade,'rgba(96,72,51,.62)',.7);
  }
  path(ctx,top,'#81965f','rgba(119,140,89,.34)',.7);
  // Soft, irregular pasture pads define the four occupied management zones.
  for(const [i,zone] of PRODUCT_BLOCKOUT.zones.entries()){
    const cornersZone=corners(zone.x,zone.y,zone.w,zone.h);
    ctx.save();ctx.globalAlpha=.16;path(ctx,cornersZone,zone.kind==='holdingPen'?'#d8b778':['#c7d792','#d7d99a','#b9ce87','#cad48b'][i]);ctx.restore();
    ctx.save();ctx.setLineDash([4,3]);path(ctx,cornersZone,null,'rgba(47,81,47,.48)',1);ctx.restore();
  }
  for(const structure of PRODUCT_BLOCKOUT.structures){
    const p=corners(structure.x,structure.y,structure.w,structure.h);
    const color={farmstead:'rgba(204,176,115,.24)',pond:'rgba(85,153,160,.26)',barnCorral:'rgba(168,126,73,.25)',crops:'rgba(155,174,103,.28)'}[structure.kind];
    path(ctx,p,color);
  }
  // Bounded deterministic marks vary the surface without a repeated grass bitmap.
  for(let row=0;row<PRODUCT_WORLD.height;row++)for(let col=0;col<PRODUCT_WORLD.width;col++){
    const n=((col*37+row*71+col*row*13)%101)/101;if(n>.83)continue;
    const p=worldToScreen(col+.5,row+.5);ctx.fillStyle=n<.2?'rgba(226,206,143,.55)':'rgba(48,80,44,.23)';
    ctx.beginPath();ctx.ellipse(p.x+((col*17+row*23)%11)-5,p.y+((col*7+row*5)%5)-2,n<.2?1.15:.7,1.25,0,0,Math.PI*2);ctx.fill();
  }
}
function drawPaths(ctx){
  for(const route of geometry.paths){
    const points=route.points;
    ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.strokeStyle='rgba(80,60,40,.28)';ctx.lineWidth=13;ctx.stroke();ctx.strokeStyle='#b89a6b';ctx.lineWidth=9;ctx.stroke();ctx.restore();
  }
}
function drawZoneHighlights(ctx,selectedId,hoverId){
  for(const zone of PRODUCT_BLOCKOUT.zones){const selected=zone.id===selectedId,hovered=zone.id===hoverId;if(!selected&&!hovered)continue;path(ctx,corners(zone.x,zone.y,zone.w,zone.h),selected?'rgba(246,220,146,.17)':'rgba(250,244,212,.1)',selected?'#f4d98c':'#fff4d4',1.7);}
}
const fenceSegments=geometry.fenceRuns.map(run=>({id:run.id,zone:run.zoneId,a:run.from,b:run.to,screenA:run.screenFrom,screenB:run.screenTo,gate:false}));
const FENCES=[...fenceSegments,...geometry.gates.map(gate=>({...gate,gate:true}))];
function drawFence(ctx,fence){
  const a=fence.screenA??worldToScreen(fence.a.x,fence.a.y),b=fence.screenB??worldToScreen(fence.b.x,fence.b.y);
  ctx.save();ctx.lineCap='round';ctx.strokeStyle=fence.gate?'#69492f':'#8a6948';ctx.lineWidth=fence.gate?1.8:1;
  const rails=fence.gate?[-4,1]:[-5,-2,-.5];
  for(const offset of rails){ctx.beginPath();ctx.moveTo(a.x,a.y+offset);ctx.lineTo(b.x,b.y+offset);ctx.stroke();}
  ctx.fillStyle='#735538';
  for(const point of [a,b])ctx.fillRect(point.x-1,point.y-8,2,8);
  ctx.restore();
}
function drawStructure(ctx,entity){
  const p=worldToScreen(entity.x+entity.w/2,entity.y+entity.h);
  const ground=corners(entity.x,entity.y,entity.w,entity.h),height=entity.hero?24:10,raised=ground.map(point=>({x:point.x,y:point.y-height}));
  const palette={farmstead:{roof:'#a96d51',front:'#e4d3a6',side:'#c9b88e'},barnCorral:{roof:'#9b5a43',front:'#ba895e',side:'#92654a'},pond:{water:'#75aaa7',edge:'#567e78'},crops:{field:'#a8b678',row:'#5b7d4b'}}[entity.kind];
  ctx.save();ctx.fillStyle='rgba(38,48,34,.15)';ctx.beginPath();ctx.ellipse(p.x,p.y-1,(entity.w+entity.h)*PRODUCT_TILE.width*.13,4,0,0,Math.PI*2);ctx.fill();ctx.restore();
  if(entity.kind==='pond'){path(ctx,ground,palette.water,'#4e7772',1.4);ctx.save();ctx.strokeStyle='rgba(228,240,212,.68)';ctx.lineWidth=1.2;for(const t of [.28,.54,.76]){const a=worldToScreen(entity.x+entity.w*t,entity.y+entity.h*.42),b=worldToScreen(entity.x+entity.w*(t+.11),entity.y+entity.h*.48);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-2,b.x,b.y);ctx.stroke();}ctx.restore();return;}
  if(entity.kind==='crops'){path(ctx,ground,palette.field,'#6f8352',1.3);ctx.save();ctx.strokeStyle=palette.row;ctx.lineWidth=1.2;for(let row=0;row<5;row++){const a=worldToScreen(entity.x+.3,entity.y+.3+row*.5),b=worldToScreen(entity.x+entity.w-.3,entity.y+.3+row*.5);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();return;}
  path(ctx,[ground[3],ground[2],raised[2],raised[3]],palette.front,'#795c45',.8);
  path(ctx,[ground[2],ground[1],raised[1],raised[2]],palette.side,'#70543e',.8);
  path(ctx,raised,palette.roof,'#694b3b',1.1);
  ctx.save();ctx.strokeStyle='rgba(244,216,169,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(raised[0].x,raised[0].y);ctx.lineTo(raised[2].x,raised[2].y);ctx.stroke();ctx.restore();
  if(entity.id==='farmstead'||entity.id==='barn-corral'){const door=worldToScreen(entity.x+entity.w*.52,entity.y+entity.h);ctx.fillStyle=entity.id==='farmstead'?'#71573f':'#674633';ctx.fillRect(door.x-3,door.y-height*.63,6,height*.58);}
}
function hitEntity(entity,x,y){const p=worldToScreen(entity.x+entity.w/2,entity.y+entity.h/2),bounds=entity.selectionBounds??{width:entity.w,height:entity.h};const hx=bounds.width*PRODUCT_TILE.width*.45,hy=bounds.height*PRODUCT_TILE.height*.55;return Math.abs(x-p.x)<=hx&&Math.abs(y-p.y)<=hy;}
function animalScreen(animal,housing='pasture'){const position=animalWorldPosition(animal,undefined,housing);return position?worldToScreen(position.x,position.y):null;}
export function projectFarm(x,y,patch=0,housing='pasture'){return animalScreen({x,y,patch},housing)??worldToScreen(0,0);}
export function gridToFarmScreen(col,row){return worldToScreen(col,row);}
export function productFarmEntityAt(x,y){
  const structures=PRODUCT_BLOCKOUT.structures.slice().reverse();const structure=structures.find(item=>hitEntity(item,x,y));if(structure)return {id:structure.id,type:structure.kind,name:structure.id.replaceAll('-',' '),position:{x:structure.x,y:structure.y},footprint:[structure.w,structure.h],selectionBounds:{x:structure.x,y:structure.y,w:structure.w,h:structure.h},asset:structure.asset};
  for(const fence of [...FENCES].reverse()){const a=worldToScreen(fence.a.x,fence.a.y),b=worldToScreen(fence.b.x,fence.b.y),vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy)));if(Math.hypot(x-a.x-t*vx,y-a.y-t*vy)<5)return {id:fence.id,type:fence.gate?'gate':'fence',name:fence.gate?'Gate':'Pasture boundary',zone:fence.zone,edge:[fence.a,fence.b]};}
  const point=screenToWorld(x,y);const zone=PRODUCT_BLOCKOUT.zones.find(item=>point.x>=item.x&&point.x<=item.x+item.w&&point.y>=item.y&&point.y<=item.y+item.h);if(zone)return {id:zone.id,type:zone.kind,name:zone.patch===undefined?'Working corral':`Pasture ${String.fromCharCode(65+zone.patch)}`,...(zone.patch===undefined?{}:{index:zone.patch}),position:{x:zone.x,y:zone.y},footprint:[zone.w,zone.h],selectionBounds:{x:zone.x,y:zone.y,w:zone.w,h:zone.h}};
  for(const route of PRODUCT_BLOCKOUT.paths)for(let i=1;i<route.cells.length;i++){const a=worldToScreen(route.cells[i-1][0]+.5,route.cells[i-1][1]+.5),b=worldToScreen(route.cells[i][0]+.5,route.cells[i][1]+.5),vx=b.x-a.x,vy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy)));if(Math.hypot(x-a.x-t*vx,y-a.y-t*vy)<6)return {id:route.id,type:'path',name:'Farm path',cells:route.cells};}
  return null;
}
export const productFarmHoverEntityAt=productFarmEntityAt;

export function drawProductFarm(ctx,{time=0,animals=[],housing='pasture',drawAnimal=()=>{},onAnimalPosition=()=>{},selectedEntityId=null,hoverEntityId=null,debug=false}){
  ctx.clearRect(0,0,PRODUCT_SCENE_SIZE.width,PRODUCT_SCENE_SIZE.height);drawTerrain(ctx);drawPaths(ctx);drawZoneHighlights(ctx,selectedEntityId,hoverEntityId);
  const queue=[];
  for(const fence of FENCES)queue.push({depth:(fence.a.x+fence.a.y+fence.b.x+fence.b.y)/2,kind:'fence',item:fence});
  for(const item of PRODUCT_BLOCKOUT.structures)queue.push({depth:item.x+item.w/2+item.y+item.h,kind:'structure',item});
  const packed=separateAnimalVisuals(animals.map(item=>{const position=animalWorldPosition(item,undefined,housing);const zone=position&&PRODUCT_BLOCKOUT.zones.find(z=>z.id===position.zoneId);return position&&zone?{animal:item,...position,zone}:null;}).filter(Boolean));
  for(const item of packed)queue.push({depth:item.x+item.y,kind:'animal',item});
  queue.sort((a,b)=>a.depth-b.depth);
  for(const entry of queue){
    if(entry.kind==='fence'){drawFence(ctx,entry.item);continue;}
    if(entry.kind==='animal'){const p=worldToScreen(entry.item.x,entry.item.y),scale=entry.item.zone.kind==='holdingPen'?.78:1;onAnimalPosition(entry.item.animal,p);drawAnimal(entry.item.animal,p.x,p.y,time,scale);continue;}
    const item=entry.item;
    drawStructure(ctx,item);
    const selected=item.id===selectedEntityId||item.id===hoverEntityId;const p=corners(item.x,item.y,item.w,item.h);
    if(selected){ctx.save();path(ctx,p,null,item.id===selectedEntityId?'#f2d98e':'#fff6d8',2);ctx.restore();}
  }
  if(debug){ctx.save();ctx.strokeStyle='rgba(23,60,45,.25)';ctx.lineWidth=.6;for(let x=0;x<=PRODUCT_WORLD.width;x++)for(let y=0;y<=PRODUCT_WORLD.height;y++){const p=worldToScreen(x,y);ctx.beginPath();ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x,p.y-2);ctx.lineTo(p.x+4,p.y);ctx.lineTo(p.x,p.y+2);ctx.closePath();ctx.stroke();}ctx.restore();}
}

export function productFarmObjects(){return {zones:PRODUCT_BLOCKOUT.zones.map(({id,kind,patch})=>({id,type:kind,...(patch===undefined?{}:{index:patch})})),objects:PRODUCT_BLOCKOUT.structures.map(({id,kind})=>({id,type:kind})),fences:FENCES.map(({id,gate})=>({id,type:gate?'gate':'fence'})),paths:PRODUCT_BLOCKOUT.paths.map(({id})=>({id,type:'path'}))};}
