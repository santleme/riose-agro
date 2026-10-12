// Product farm diorama: a cell terrain map plus individually addressable entities.
export const PRODUCT_SCENE_SIZE=Object.freeze({width:800,height:416});
export const PRODUCT_TILE = Object.freeze({width:40,height:18,originX:300,originY:52,columns:24,rows:14,soilDepth:18});
const {width:tileWidth,height:tileHeight,originX,originY,columns,rows,soilDepth}=PRODUCT_TILE;
const gridToScreen=(col,row)=>({x:originX+(col-row)*tileWidth/2,y:originY+(col+row)*tileHeight/2});

// Prefabs are small placement recipes. Their instances below compose the object map.
export const PRODUCT_SCENE_PREFABS=Object.freeze({
  pasture:{footprint:[6,4],tiles:'meadow',boundary:'wire-fence',gate:'wood-gate',selectable:'paddock'},
  farmstead:{footprint:[5,4],house:'building-farmhouse-imagegen-v1',yard:'orchard-edge',selectable:'structure'},
  pond:{footprint:[4,3],water:'water-pond-imagegen-v1',bank:'meadow-edge',selectable:'water'},
  barnCorral:{footprint:[6,4],barn:'building-shed-imagegen-v1',corral:'corral-wood-standard-imagegen-v1',selectable:'structure'},
  crop:{footprint:[5,3],stages:['field-soybean-growing','field-soybean-mature'],rows:3,selectable:'crop'},
  treeCluster:{footprint:[3,3],variants:['vegetation-tree-shade-imagegen-v1','fruit-tree','shrub'],scatter:'deterministic',selectable:'tree'},
  roadConnector:{surface:'dirt-path',connections:['pasture','farmstead','barn'],selectable:'path'},
  fenceBoundary:{segment:'fence-wire-wood-post-imagegen-v1',snapping:'grid-edge',selectable:'fence'},
  service:{assets:['silo','technology-gateway-antenna-imagegen-v1','water-reservoir-imagegen-v1'],selectable:'structure'}
});

// Blockout first: the paddock pair occupies the northwest half; the connected
// farmstead, water, working yard and crops form one compact southeast campus.
const FARM_BLOCKOUT=Object.freeze({
  pastures:[
    {id:'paddock-a',type:'paddock',name:'Pasture A',index:0,col:1,row:1,cols:6,rows:4,prefab:'pasture'},
    {id:'paddock-b',type:'paddock',name:'Pasture B',index:1,col:1,row:6,cols:6,rows:4,prefab:'pasture'},
    {id:'paddock-c',type:'paddock',name:'Pasture C',index:2,col:8,row:1,cols:6,rows:4,prefab:'pasture'},
    {id:'paddock-d',type:'paddock',name:'Pasture D',index:3,col:8,row:6,cols:6,rows:4,prefab:'pasture'}
  ],
  farmstead:{col:17,row:1},water:{col:19,row:5},barnCorral:{col:16,row:8},crops:{col:18,row:11},greenEdge:'island-perimeter'
});
const PASTURES=FARM_BLOCKOUT.pastures;

function object(id,type,name,asset,col,row,w,h,options={}){
  const snap=value=>Math.round(value*2)/2;
  return {id,type,name,asset,col:snap(col),row:snap(row),w,h,anchor:'bottom',layer:options.layer??'props',prefab:options.prefab??type,priority:options.priority??0,hitW:options.hitW??Math.max(1,w*.34),hitH:options.hitH??Math.max(1,h*.22),rotation:options.rotation??0};
}
const PREFAB_ANCHORS=Object.freeze({farmstead:FARM_BLOCKOUT.farmstead,pond:FARM_BLOCKOUT.water,barnCorral:FARM_BLOCKOUT.barnCorral,crop:FARM_BLOCKOUT.crops,service:FARM_BLOCKOUT.barnCorral});
function prefabObject(id,type,name,asset,prefab,offsetCol,offsetRow,w,h,options={}){const anchor=PREFAB_ANCHORS[prefab];return object(id,type,name,asset,anchor.col+offsetCol,anchor.row+offsetRow,w,h,{...options,prefab});}
const OBJECTS=[
  prefabObject('farmhouse','structure','Farmhouse','building-farmhouse-imagegen-v1','farmstead',1.1,.7,86,65,{hitW:22,hitH:16,priority:4}),
  prefabObject('farm-workshop','structure','Workshop','building-workshop-imagegen-v1','farmstead',3.7,2.8,47,38,{hitW:14,hitH:10}),
  prefabObject('cattle-shed','structure','Cattle shed','building-shed-imagegen-v1','barnCorral',1.2,.7,88,65,{hitW:22,hitH:15,priority:4}),
  prefabObject('corral-main','structure','Working corral','corral-wood-standard-imagegen-v1','barnCorral',-.4,.7,67,48,{hitW:19,hitH:12}),
  prefabObject('handling-alley','structure','Cattle handling alley','handling-alley-cattle-imagegen-v1','barnCorral',-1,.0,46,28,{hitW:13,hitH:7}),
  prefabObject('handling-chute','structure','Handling chute','handling-chute-cattle-imagegen-v1','barnCorral',0,.0,36,28,{hitW:11,hitH:7}),
  prefabObject('water','water','Pond','water-pond-imagegen-v1','pond',1,.6,70,51,{hitW:23,hitH:15}),
  object('water-trough','water','Pasture water trough','water-trough-round-imagegen-v1',12.3,5.8,31,24,{hitW:9,hitH:7,prefab:'pasture'}),
  prefabObject('feeding-trough','structure','Hay feeder','feed-trough-hay-imagegen-v1','barnCorral',2.2,2.1,39,28,{hitW:11,hitH:8}),
  prefabObject('salt-feeder','structure','Mineral feeder','feed-salt-roofed-imagegen-v1','barnCorral',1,2.5,34,29,{hitW:10,hitH:8}),
  prefabObject('silo','structure','Feed silo','silo','service',5.2,.3,28,45,{hitW:9,hitH:9}),
  prefabObject('tractor','vehicle','Tractor','vehicle-tractor-imagegen-v1','service',-3.3,2.7,45,32,{hitW:13,hitH:10}),
  prefabObject('pickup','vehicle','Farm pickup','vehicle-pickup-rural-imagegen-v1','service',2.7,-1.1,42,28,{hitW:12,hitH:9}),
  prefabObject('service-reservoir','structure','Water reservoir','water-reservoir-imagegen-v1','farmstead',4.4,3.1,40,31,{hitW:11,hitH:8}),
  prefabObject('service-gateway','structure','Herd monitor','technology-gateway-antenna-imagegen-v1','farmstead',3,2.4,24,34,{hitW:8,hitH:9}),
  prefabObject('service-scale','structure','Livestock scale','technology-scale-electronic-imagegen-v1','barnCorral',1.3,1.2,29,22,{hitW:9,hitH:7}),
  prefabObject('crop-field','crop','Soybean field','field-soybean-growing','crop',1,.2,54,35,{hitW:23,hitH:11,layer:'crop'}),
  prefabObject('crop-field-mature','crop','Mature crop rows','field-maize-growing','crop',3.2,.7,48,33,{hitW:18,hitH:10,layer:'crop'})
];

const TREE_PLACEMENTS=[
  // Clusters follow the perimeter and leave clean sightlines through the work zones.
  [.3,.8,'vegetation-tree-shade-imagegen-v1',40,46],[1.1,3.9,'fruit-tree',31,37],[.4,8.7,'vegetation-tree-shade-imagegen-v1',43,48],[1.5,11.5,'fruit-tree',31,37],
  [5.7,.25,'vegetation-tree-shade-imagegen-v1',39,45],[10.7,.2,'fruit-tree',32,37],[14.6,.8,'vegetation-tree-shade-imagegen-v1',42,48],[23,1.9,'vegetation-tree-shade-imagegen-v1',42,48],
  [23,6.2,'fruit-tree',32,37],[22.7,10.2,'vegetation-tree-shade-imagegen-v1',40,46],[16,13,'fruit-tree',32,37],[10.5,13.1,'vegetation-tree-shade-imagegen-v1',42,47],
  [7.4,5.4,'shrub',25,21],[14.8,5.8,'shrub',24,20],[16.1,3.8,'fruit-tree',29,34],[7.2,10.1,'shrub',25,20],
  [13.9,11.6,'vegetation-tree-shade-imagegen-v1',36,42],[2.9,12.8,'fruit-tree',29,35],[21.9,2.1,'shrub',25,20]
];
const TREES=TREE_PLACEMENTS.map(([col,row,asset,w,h],index)=>object(`tree-${index}`,'tree',asset==='fruit-tree'?'Fruit tree':asset==='shrub'?'Shrub':'Shade tree',asset,col,row,w,h,{hitW:w*.38,hitH:h*.27,prefab:'treeCluster'}));

// Route cells are ground tiles; each route remains selectable as a path zone.
const ROAD_CELLS=new Set();
const ROAD_PATHS=[
  [[1,12],[5,12],[9,12],[13,12],[16,10],[18,9],[20,7],[20,4],[18,2]],
  [[13,12],[13,10],[12,8],[11,7],[10,6],[8,5],[7,4]],
  [[20,7],[22,8],[23,9]]
];
function route(points){for(let index=1;index<points.length;index++){let [col,row]=points[index-1];const [endCol,endRow]=points[index];ROAD_CELLS.add(`${col},${row}`);while(col!==endCol||row!==endRow){if(col!==endCol)col+=Math.sign(endCol-col);else if(row!==endRow)row+=Math.sign(endRow-row);ROAD_CELLS.add(`${col},${row}`);}}if(points.length)ROAD_CELLS.add(points.at(-1).join(','));}
ROAD_PATHS.forEach(route);

function fenceSegments(){
  const segments=[],seen=new Set();
  const gates=new Set(['paddock-a:e:1','paddock-b:e:1','paddock-c:w:1','paddock-d:w:1']);
  for(const zone of PASTURES){
    const edges=[['n',zone.col-.5,zone.row-.5,1,0,zone.cols],['e',zone.col+zone.cols-.5,zone.row-.5,0,1,zone.rows],['s',zone.col+zone.cols-.5,zone.row+zone.rows-.5,-1,0,zone.cols],['w',zone.col-.5,zone.row+zone.rows-.5,0,-1,zone.rows]];
    for(const [edge,col,row,dc,dr,count] of edges){
      for(let step=0;step<count;step++){
        const gateKey=`${zone.id}:${edge}:${step}`;if(gates.has(gateKey))continue;
        const a={col:col+dc*step,row:row+dr*step},b={col:col+dc*(step+1),row:row+dr*(step+1)};
        const key=[`${a.col},${a.row}`,`${b.col},${b.row}`].sort().join('|');if(seen.has(key))continue;seen.add(key);
        segments.push({id:`fence-${zone.id}-${edge}-${step}`,type:'fence',name:`${zone.name} boundary`,a,b,zone:zone.id,gate:false,prefab:'fenceBoundary'});
      }
    }
  }
  for(const gate of [
    {id:'main-gate',type:'fence',name:'Pasture A gate',a:{col:6.5,row:1.5},b:{col:6.5,row:2.5}},
    {id:'gate-b',type:'fence',name:'Pasture B gate',a:{col:6.5,row:6.5},b:{col:6.5,row:7.5}},
    {id:'gate-c',type:'fence',name:'Pasture C gate',a:{col:7.5,row:2.5},b:{col:7.5,row:3.5}},
    {id:'gate-d',type:'fence',name:'Pasture D gate',a:{col:7.5,row:7.5},b:{col:7.5,row:8.5}},
    {id:'corral-gate',type:'fence',name:'Corral gate',a:{col:15.5,row:8.5},b:{col:15.5,row:9.5}}
  ])segments.push({...gate,gate:true,prefab:'fenceBoundary'});
  return segments;
}
const FENCES=fenceSegments();

export function projectFarm(x,y){
  // The herd model keeps continuous paddock coordinates; map them into the pasture grid.
  const col=.8+Math.max(0,Math.min(342,x)-28)/314*13;
  const row=1.2+Math.max(0,Math.min(283,y)-38)/245*9;
  return gridToScreen(col,row);
}
export function gridToFarmScreen(col,row){return gridToScreen(col,row);}

function polygon(ctx,points,fill,stroke=null,lineWidth=1){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}}
function lerpPoint(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function beveledOutline(corners,cut=10){return corners.flatMap((corner,index)=>{const previous=corners[(index+corners.length-1)%corners.length],next=corners[(index+1)%corners.length];return [lerpPoint(corner,previous,cut/Math.hypot(previous.x-corner.x,previous.y-corner.y)),lerpPoint(corner,next,cut/Math.hypot(next.x-corner.x,next.y-corner.y))];});}
function drawBase(ctx){
  const mapCorners=[gridToScreen(-.5,-.5),gridToScreen(columns-.5,-.5),gridToScreen(columns-.5,rows-.5),gridToScreen(-.5,rows-.5)];
  const outline=beveledOutline(mapCorners,11),turf=ctx.createLinearGradient(mapCorners[0].x,mapCorners[0].y,mapCorners[2].x,mapCorners[2].y);turf.addColorStop(0,'#91a86a');turf.addColorStop(.48,'#84995e');turf.addColorStop(1,'#718751');
  ctx.save();ctx.shadowColor='rgba(56,47,34,.25)';ctx.shadowBlur=22;ctx.shadowOffsetY=15;polygon(ctx,outline,turf);ctx.restore();
  const lower=(point,offset)=>({x:point.x,y:point.y+offset});
  const faceA=[outline[3],outline[4],outline[5]],faceB=[outline[5],outline[6],outline[7]];
  for(const [face,base,deep] of [[faceA,'#976443','#704a35'],[faceB,'#835739','#62442f']]){
    polygon(ctx,[...face,...face.slice().reverse().map(point=>lower(point,soilDepth))],base,'#614832',.8);
    const band=face.map(point=>lower(point,soilDepth*.58));
    polygon(ctx,[face[0],face[1],band[1],band[0]],'#b17a4e');
    polygon(ctx,[band[0],band[1],lower(face[1],soilDepth),lower(face[0],soilDepth)],deep);
  }
  ctx.strokeStyle='rgba(224,204,157,.88)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(outline[7].x,outline[7].y);for(let i=0;i<=7;i++)ctx.lineTo(outline[i].x,outline[i].y);ctx.stroke();
}
function inPasture(col,row){return PASTURES.find(zone=>col>=zone.col-.5&&col<zone.col+zone.cols-.5&&row>=zone.row-.5&&row<zone.row+zone.rows-.5);}
function tileNoise(col,row,salt=0){
  let value=Math.imul(col+19+salt,0x45d9f3b)^Math.imul(row+37+salt,0x119de1f3);
  value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);
  return ((value^(value>>>16))>>>0)/4294967296;
}
function gridRegion(ctx,col,row,cols,rows,color){const corners=[gridToScreen(col-.5,row-.5),gridToScreen(col+cols-.5,row-.5),gridToScreen(col+cols-.5,row+rows-.5),gridToScreen(col-.5,row+rows-.5)];polygon(ctx,corners,color);}
function drawRoads(ctx){
  for(const routePoints of ROAD_PATHS){
    const points=routePoints.map(([col,row])=>gridToScreen(col,row));
    const trace=()=>{ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++){const previous=points[i-1],point=points[i];if(i<points.length-1){const next=points[i+1],mx=(point.x+next.x)/2,my=(point.y+next.y)/2;ctx.quadraticCurveTo(point.x,point.y,mx,my);}else ctx.lineTo(point.x,point.y);}};
    ctx.lineCap='round';ctx.lineJoin='round';trace();ctx.strokeStyle='rgba(88,67,45,.38)';ctx.lineWidth=11;ctx.stroke();
    trace();ctx.strokeStyle='#bc9465';ctx.lineWidth=8;ctx.stroke();
    trace();ctx.setLineDash([2,5]);ctx.strokeStyle='rgba(238,216,173,.55)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
  }
}
function drawTerrain(ctx){
  drawBase(ctx);
  const mapCorners=[gridToScreen(-.5,-.5),gridToScreen(columns-.5,-.5),gridToScreen(columns-.5,rows-.5),gridToScreen(-.5,rows-.5)];
  const outline=beveledOutline(mapCorners,11);ctx.save();ctx.beginPath();ctx.moveTo(outline[0].x,outline[0].y);for(let i=1;i<outline.length;i++)ctx.lineTo(outline[i].x,outline[i].y);ctx.closePath();ctx.clip();
  // Blockout color fields make each land use legible without drawing a visible tile grid.
  for(const zone of PASTURES)gridRegion(ctx,zone.col,zone.row,zone.cols,zone.rows,'rgba(188,210,136,.12)');
  for(const [key,prefab,color] of [['farmstead','farmstead','rgba(220,217,158,.10)'],['water','pond','rgba(111,164,150,.18)'],['barnCorral','barnCorral','rgba(156,117,68,.19)'],['crops','crop','rgba(129,151,78,.18)']]){
    const anchor=FARM_BLOCKOUT[key],[cols,rows]=PRODUCT_SCENE_PREFABS[prefab].footprint;gridRegion(ctx,anchor.col,anchor.row,cols,rows,color);
  }
  for(let depth=0;depth<columns+rows;depth++)for(let col=0;col<columns;col++){
    const row=depth-col;if(row<0||row>=rows)continue;
    // A restrained, deterministic scatter gives the tilemap texture without repeating a tile image.
    const p=gridToScreen(col,row),seed=tileNoise(col,row,11),variation=tileNoise(col,row,23);
    if(!ROAD_CELLS.has(`${col},${row}`)&&seed<.36){
      const x=p.x+(tileNoise(col,row,31)-.5)*18,y=p.y+(tileNoise(col,row,47)-.5)*7;
      ctx.fillStyle=variation<.12?'rgba(226,202,126,.54)':'rgba(54,91,48,.25)';
      ctx.beginPath();ctx.ellipse(x,y,variation<.12?1.1:.8+variation,1.2+variation*1.4,-.3+variation*.5,0,Math.PI*2);ctx.fill();
      if(variation>.82){ctx.strokeStyle='rgba(57,91,51,.46)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-2,y+2);ctx.lineTo(x-3,y-1);ctx.moveTo(x,y+2);ctx.lineTo(x+1,y-2);ctx.stroke();}
    }
  }
  drawRoads(ctx);
  ctx.restore();
}
function drawPastureZones(ctx,selectedId,hoverId){
  for(const zone of PASTURES){
    const active=zone.id===selectedId||zone.id===hoverId;const minC=zone.col-.5,maxC=zone.col+zone.cols-.5,minR=zone.row-.5,maxR=zone.row+zone.rows-.5;
    const corners=[gridToScreen(minC,minR),gridToScreen(maxC,minR),gridToScreen(maxC,maxR),gridToScreen(minC,maxR)];
    ctx.save();polygon(ctx,corners,active?'rgba(246,221,148,.17)':null,active?'rgba(247,225,158,.95)':null,active?1.8:.75);ctx.restore();
  }
}
function drawFence(ctx,fence,drawAsset){
  const a=gridToScreen(fence.a.col,fence.a.row),b=gridToScreen(fence.b.col,fence.b.row),angle=Math.atan2(b.y-a.y,b.x-a.x),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
  if(fence.gate){drawAsset('fence-gate-wood-imagegen-v1',cx,cy+4,29,23,'bottom',angle);return;}
  // Modular post-and-wire run; each grid-edge segment has its own hit target.
  ctx.save();ctx.strokeStyle='#806044';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y-2);ctx.lineTo(b.x,b.y-2);ctx.moveTo(a.x,a.y+1);ctx.lineTo(b.x,b.y+1);ctx.stroke();
  for(const point of [a,b]){ctx.fillStyle='#684d36';ctx.fillRect(point.x-1.15,point.y-8,2.3,9);ctx.fillStyle='#ad8355';ctx.fillRect(point.x-.9,point.y-8,1,3);}
  ctx.restore();
  if(drawAsset&&fence.id.endsWith('-0'))drawAsset('fence-wire-wood-post-imagegen-v1',cx,cy+5,36,23,'bottom',angle);
}
function objectHit(entity,x,y){const p=gridToScreen(entity.col,entity.row);return Math.abs(x-p.x)<=entity.hitW&&Math.abs(y-(p.y-entity.h*.36))<=entity.hitH;}
function inverseGrid(x,y){const dx=(x-originX)/(tileWidth/2),dy=(y-originY)/(tileHeight/2);return {col:(dx+dy)/2,row:(dy-dx)/2};}
export function productFarmEntityAt(x,y){
  const ranked=[...OBJECTS,...TREES].sort((a,b)=>(b.col+b.row)-(a.col+a.row));
  const hit=ranked.find(entity=>objectHit(entity,x,y));if(hit)return {id:hit.id,type:hit.type,name:hit.name};
  for(const fence of [...FENCES].reverse()){
    const a=gridToScreen(fence.a.col,fence.a.row),b=gridToScreen(fence.b.col,fence.b.row),vx=b.x-a.x,vy=b.y-a.y,den=vx*vx+vy*vy,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/den));
    if(Math.hypot(x-(a.x+t*vx),y-(a.y+t*vy))<5)return {id:fence.id,type:'fence',name:fence.name};
  }
  const grid=inverseGrid(x,y);const zone=PASTURES.find(area=>grid.col>=area.col-.5&&grid.col<area.col+area.cols-.5&&grid.row>=area.row-.5&&grid.row<area.row+area.rows-.5);
  if(zone)return {id:zone.id,type:zone.type,name:zone.name,index:zone.index};
  for(const routePoints of ROAD_PATHS){const points=routePoints.map(([col,row])=>gridToScreen(col,row));for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],vx=b.x-a.x,vy=b.y-a.y,den=vx*vx+vy*vy,t=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/den));if(Math.hypot(x-(a.x+t*vx),y-(a.y+t*vy))<7)return {id:'farm-path',type:'path',name:'Farm route'};}}
  if(ROAD_CELLS.has(`${Math.round(grid.col)},${Math.round(grid.row)}`))return {id:'farm-path',type:'path',name:'Farm route'};
  if(grid.col>=FARM_BLOCKOUT.crops.col-.5&&grid.col<FARM_BLOCKOUT.crops.col+PRODUCT_SCENE_PREFABS.crop.footprint[0]-.5&&grid.row>=FARM_BLOCKOUT.crops.row-.5&&grid.row<FARM_BLOCKOUT.crops.row+PRODUCT_SCENE_PREFABS.crop.footprint[1]-.5)return {id:'crop-field',type:'crop',name:'Soybean field'};
  return null;
}
export function productFarmHoverEntityAt(x,y){return productFarmEntityAt(x,y);}

export function drawProductFarm(ctx,{drawAsset,assetsReady,time=0,animals=[],drawAnimal=()=>{},selectedEntityId=null,hoverEntityId=null}){
  ctx.fillStyle='#e7eadb';ctx.fillRect(0,0,PRODUCT_SCENE_SIZE.width,PRODUCT_SCENE_SIZE.height);drawTerrain(ctx);drawPastureZones(ctx,selectedEntityId,hoverEntityId);
  // Crop rows are a prefab: alternating growth stages, aligned to the same grid anchor.
  for(const crop of OBJECTS.filter(item=>item.type==='crop')){
    const p=gridToScreen(crop.col,crop.row);drawAsset(crop.asset,p.x,p.y+4,crop.w,crop.h,'bottom');
    if(assetsReady&&crop.id==='crop-field')for(let row=0;row<2;row++)for(let col=0;col<3;col++){
      const point=gridToScreen(crop.col+col*.28,crop.row+row*.24);drawAsset('field-soybean-mature',point.x,point.y+3,17,13,'bottom');
    }
  }
  const queue=[];
  for(const fence of FENCES)queue.push({kind:'fence',depth:(fence.a.col+fence.a.row+fence.b.col+fence.b.row)/2,item:fence,priority:0});
  for(const prop of [...OBJECTS.filter(item=>item.type!=='crop'),...TREES])queue.push({kind:'prop',depth:prop.col+prop.row,item:prop,priority:prop.layer==='props'?2:1});
  for(const {animal,x,y} of animals){const point=projectFarm(x,y),grid=inverseGrid(point.x,point.y);queue.push({kind:'animal',depth:grid.col+grid.row,item:animal,point,priority:3});}
  queue.sort((a,b)=>a.depth-b.depth||a.priority-b.priority);
  for(const entry of queue){
    if(entry.kind==='fence'){drawFence(ctx,entry.item,drawAsset);continue;}
    if(entry.kind==='animal'){drawAnimal(entry.item,entry.point.x,entry.point.y,time);continue;}
    const prop=entry.item,p=gridToScreen(prop.col,prop.row);drawAsset(prop.asset,p.x,p.y,prop.w,prop.h,prop.anchor,prop.rotation);
    if(prop.id===selectedEntityId||prop.id===hoverEntityId){ctx.save();ctx.setLineDash([3,2]);ctx.strokeStyle=prop.id===selectedEntityId?'#f5d890':'rgba(250,244,212,.9)';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(p.x,p.y-4,prop.hitW+2,prop.hitH+3,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  }
  for(const entityId of [selectedEntityId,hoverEntityId])if(entityId==='farm-path'){
    ctx.save();ctx.strokeStyle=entityId===selectedEntityId?'#f5d890':'rgba(250,244,212,.9)';ctx.lineWidth=2;
    for(const key of ROAD_CELLS){const [col,row]=key.split(',').map(Number),p=gridToScreen(col,row);ctx.beginPath();ctx.ellipse(p.x,p.y,12,6,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
  }
}

export function productFarmObjects(){return {pastures:PASTURES.map(({id,type,name,index,prefab})=>({id,type,name,index,prefab})),objects:OBJECTS.map(({id,type,name,prefab})=>({id,type,name,prefab})),trees:TREES.map(({id,type,name,prefab})=>({id,type,name,prefab})),fences:FENCES.map(({id,type,name,prefab})=>({id,type,name,prefab})),paths:[{id:'farm-path',type:'path',name:'Farm route',prefab:'roadConnector'}]};}
