// Product farm diorama: a cell terrain map plus individually addressable entities.
export const PRODUCT_TILE = Object.freeze({width:32,height:16,originX:224,originY:30,columns:20,rows:12,soilDepth:12});
const {width:tileWidth,height:tileHeight,originX,originY,columns,rows,soilDepth}=PRODUCT_TILE;
const gridToScreen=(col,row)=>({x:originX+(col-row)*tileWidth/2,y:originY+(col+row)*tileHeight/2});
const tileCorners=(col,row)=>{const p=gridToScreen(col,row),hx=tileWidth/2,hy=tileHeight/2;return [{x:p.x,y:p.y-hy},{x:p.x+hx,y:p.y},{x:p.x,y:p.y+hy},{x:p.x-hx,y:p.y}];};

// Prefabs are small placement recipes. Their instances below compose the object map.
export const PRODUCT_SCENE_PREFABS=Object.freeze({
  pasture:{tiles:'meadow',boundary:'wire-fence',gate:'wood-gate',selectable:'paddock'},
  farmstead:{house:'building-farmhouse-imagegen-v1',yard:'orchard-edge',selectable:'structure'},
  pond:{water:'water-pond-imagegen-v1',bank:'meadow-edge',selectable:'water'},
  barnCorral:{barn:'building-shed-imagegen-v1',corral:'corral-wood-standard-imagegen-v1',selectable:'structure'},
  crop:{stages:['field-soybean-growing','field-soybean-mature'],rows:3,selectable:'crop'},
  treeCluster:{variants:['vegetation-tree-shade-imagegen-v1','fruit-tree','shrub'],scatter:'deterministic',selectable:'tree'},
  roadConnector:{surface:'dirt-path',connections:['pasture','farmstead','barn'],selectable:'path'},
  fenceBoundary:{segment:'fence-wire-wood-post-imagegen-v1',snapping:'grid-edge',selectable:'fence'},
  service:{assets:['silo','technology-gateway-antenna-imagegen-v1','water-reservoir-imagegen-v1'],selectable:'structure'}
});

const PASTURES=[
  {id:'paddock-a',type:'paddock',name:'Pasture A',index:0,col:1,row:1,cols:5,rows:4,prefab:'pasture'},
  {id:'paddock-b',type:'paddock',name:'Pasture B',index:1,col:7,row:1,cols:5,rows:4,prefab:'pasture'},
  {id:'paddock-c',type:'paddock',name:'Pasture C',index:2,col:1,row:6,cols:5,rows:4,prefab:'pasture'},
  {id:'paddock-d',type:'paddock',name:'Pasture D',index:3,col:7,row:6,cols:5,rows:4,prefab:'pasture'}
];

function object(id,type,name,asset,col,row,w,h,options={}){
  const snap=value=>Math.round(value*2)/2;
  return {id,type,name,asset,col:snap(col),row:snap(row),w,h,anchor:'bottom',layer:options.layer??'props',prefab:options.prefab??type,priority:options.priority??0,hitW:options.hitW??Math.max(1,w*.34),hitH:options.hitH??Math.max(1,h*.22),rotation:options.rotation??0};
}
const OBJECTS=[
  object('farmhouse','structure','Farmhouse','building-farmhouse-imagegen-v1',15.2,1.8,70,54,{hitW:18,hitH:13,prefab:'farmstead'}),
  object('farm-workshop','structure','Workshop','building-workshop-imagegen-v1',17.6,3.5,48,39,{hitW:14,hitH:10,prefab:'farmstead'}),
  object('cattle-shed','structure','Cattle shed','building-shed-imagegen-v1',14.8,8.8,78,58,{hitW:19,hitH:12,prefab:'barnCorral'}),
  object('corral-main','structure','Working corral','corral-wood-standard-imagegen-v1',12.6,8.5,64,45,{hitW:18,hitH:11,prefab:'barnCorral'}),
  object('handling-alley','structure','Cattle handling alley','handling-alley-cattle-imagegen-v1',12.1,7.2,45,27,{hitW:13,hitH:7,prefab:'barnCorral'}),
  object('handling-chute','structure','Handling chute','handling-chute-cattle-imagegen-v1',13.1,7.6,36,28,{hitW:11,hitH:7,prefab:'barnCorral'}),
  object('water','water','Pond','water-pond-imagegen-v1',17.5,6.5,63,46,{hitW:21,hitH:13,prefab:'pond'}),
  object('water-trough','water','Pasture water trough','water-trough-round-imagegen-v1',10.8,5.9,30,23,{hitW:8,hitH:6,prefab:'pasture'}),
  object('feeding-trough','structure','Hay feeder','feed-trough-hay-imagegen-v1',14,10,38,27,{hitW:10,hitH:7,prefab:'barnCorral'}),
  object('salt-feeder','structure','Mineral feeder','feed-salt-roofed-imagegen-v1',15.7,9.4,34,29,{hitW:10,hitH:8,prefab:'barnCorral'}),
  object('silo','structure','Feed silo','silo',18.1,8.4,25,42,{hitW:8,hitH:8,prefab:'service'}),
  object('tractor','vehicle','Tractor','vehicle-tractor-imagegen-v1',10.2,9.4,42,30,{hitW:12,hitH:9,prefab:'service'}),
  object('pickup','vehicle','Farm pickup','vehicle-pickup-rural-imagegen-v1',15.7,6.1,39,26,{hitW:11,hitH:8,prefab:'service'}),
  object('service-reservoir','structure','Water reservoir','water-reservoir-imagegen-v1',18.1,4.7,40,30,{hitW:11,hitH:8,prefab:'service'}),
  object('service-gateway','structure','Herd monitor','technology-gateway-antenna-imagegen-v1',16.7,4.5,24,33,{hitW:8,hitH:8,prefab:'service'}),
  object('service-scale','structure','Livestock scale','technology-scale-electronic-imagegen-v1',13.3,9.1,28,21,{hitW:9,hitH:6,prefab:'service'}),
  object('crop-field','crop','Soybean field','field-soybean-growing',5.1,10.2,47,31,{hitW:22,hitH:10,layer:'crop',prefab:'crop'}),
  object('crop-field-mature','crop','Mature crop rows','field-maize-growing',7.3,10.8,43,29,{hitW:17,hitH:9,layer:'crop',prefab:'crop'})
];

const TREE_PLACEMENTS=[
  [0.4,1.6,'vegetation-tree-shade-imagegen-v1',38,43],[.2,4.1,'fruit-tree',31,37],[.4,8.8,'vegetation-tree-shade-imagegen-v1',42,46],[1.5,10.2,'fruit-tree',30,36],
  [5.2,.4,'vegetation-tree-shade-imagegen-v1',37,43],[10.4,.2,'fruit-tree',31,36],[12.8,.7,'vegetation-tree-shade-imagegen-v1',41,46],[18.9,1.7,'vegetation-tree-shade-imagegen-v1',42,46],
  [19.2,5.5,'fruit-tree',30,36],[19.1,9.5,'vegetation-tree-shade-imagegen-v1',39,43],[16,11.1,'fruit-tree',31,35],[11.3,11.2,'vegetation-tree-shade-imagegen-v1',40,45],
  [8.8,5.2,'shrub',25,21],[13.2,5.7,'shrub',23,19],[14.1,3.8,'fruit-tree',28,33],[3.1,5.3,'shrub',25,20],
  [8.1,9.7,'vegetation-tree-shade-imagegen-v1',34,39],[2.8,10.7,'fruit-tree',27,33],[18.3,3.2,'shrub',24,18]
];
const TREES=TREE_PLACEMENTS.map(([col,row,asset,w,h],index)=>object(`tree-${index}`,'tree',asset==='fruit-tree'?'Fruit tree':asset==='shrub'?'Shrub':'Shade tree',asset,col,row,w,h,{hitW:w*.38,hitH:h*.27,prefab:'treeCluster'}));

// Route cells are ground tiles; each route remains selectable as a path zone.
const ROAD_CELLS=new Set();
const ROAD_PATHS=[
  [[0,9],[4,9],[8,9],[12,9],[15,9],[17,7],[17,4],[15,2]],
  [[12,9],[12,7],[10,6],[8,6],[6,5],[4,5],[2,4]],
  [[17,7],[19,8]]
];
function route(points){for(let index=1;index<points.length;index++){let [col,row]=points[index-1];const [endCol,endRow]=points[index];ROAD_CELLS.add(`${col},${row}`);while(col!==endCol||row!==endRow){if(col!==endCol)col+=Math.sign(endCol-col);else if(row!==endRow)row+=Math.sign(endRow-row);ROAD_CELLS.add(`${col},${row}`);}}if(points.length)ROAD_CELLS.add(points.at(-1).join(','));}
route([[0,9],[4,9],[8,9],[12,9],[15,9],[17,7],[17,4],[15,2]]);
route([[12,9],[12,7],[10,6],[8,6],[6,5],[4,5],[2,4]]);
route([[17,7],[19,8]]);

function fenceSegments(){
  const segments=[],seen=new Set();
  const gates=new Set(['paddock-a:e:1','paddock-b:w:2','paddock-c:e:1','paddock-d:w:2']);
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
    {id:'main-gate',type:'fence',name:'Pasture A gate',a:{col:5.5,row:1.5},b:{col:5.5,row:2.5}},
    {id:'gate-b',type:'fence',name:'Pasture B gate',a:{col:6.5,row:2.5},b:{col:6.5,row:3.5}},
    {id:'gate-c',type:'fence',name:'Pasture C gate',a:{col:5.5,row:6.5},b:{col:5.5,row:7.5}},
    {id:'gate-d',type:'fence',name:'Pasture D gate',a:{col:6.5,row:7.5},b:{col:6.5,row:8.5}},
    {id:'corral-gate',type:'fence',name:'Corral gate',a:{col:12,row:8},b:{col:13,row:8}}
  ])segments.push({...gate,gate:true,prefab:'fenceBoundary'});
  return segments;
}
const FENCES=fenceSegments();

export function projectFarm(x,y){
  // The herd model keeps continuous paddock coordinates; map them into the pasture grid.
  const col=.8+Math.max(0,Math.min(342,x)-28)/314*12;
  const row=1.2+Math.max(0,Math.min(283,y)-38)/245*8.5;
  return gridToScreen(col,row);
}
export function gridToFarmScreen(col,row){return gridToScreen(col,row);}

function polygon(ctx,points,fill,stroke=null,lineWidth=1){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}}
function drawBase(ctx){
  const mapCorners=[gridToScreen(-.5,-.5),gridToScreen(columns-.5,-.5),gridToScreen(columns-.5,rows-.5),gridToScreen(-.5,rows-.5)];
  const turf=ctx.createLinearGradient(mapCorners[0].x,mapCorners[0].y,mapCorners[2].x,mapCorners[2].y);turf.addColorStop(0,'#879d62');turf.addColorStop(.52,'#82995c');turf.addColorStop(1,'#779056');
  ctx.save();ctx.shadowColor='rgba(56,47,34,.2)';ctx.shadowBlur=16;ctx.shadowOffsetY=12;polygon(ctx,mapCorners,turf);ctx.restore();
  const bottomRight=mapCorners[2],right=mapCorners[1],left=mapCorners[3];
  polygon(ctx,[right,bottomRight,{x:bottomRight.x,y:bottomRight.y+soilDepth},{x:right.x,y:right.y+soilDepth}], '#986441','#734a32',.8);
  polygon(ctx,[bottomRight,left,{x:left.x,y:left.y+soilDepth},{x:bottomRight.x,y:bottomRight.y+soilDepth}], '#815536','#67452f',.8);
  ctx.strokeStyle='rgba(226,202,143,.72)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(left.x,left.y);ctx.lineTo(bottomRight.x,bottomRight.y);ctx.lineTo(right.x,right.y);ctx.stroke();
}
function inPasture(col,row){return PASTURES.find(zone=>col>=zone.col-.5&&col<zone.col+zone.cols-.5&&row>=zone.row-.5&&row<zone.row+zone.rows-.5);}
function tileNoise(col,row,salt=0){
  let value=Math.imul(col+19+salt,0x45d9f3b)^Math.imul(row+37+salt,0x119de1f3);
  value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);
  return ((value^(value>>>16))>>>0)/4294967296;
}
function terrainCellColor(col,row){
  const pasture=inPasture(col,row),crop=row>=9&&col>=3&&col<=8;
  const tone=tileNoise(col,row)-.5;
  const base=crop?[119,141,81]:pasture?[129,151,93]:[131,153,96];
  return `rgb(${Math.round(base[0]+tone*7)},${Math.round(base[1]+tone*9)},${Math.round(base[2]+tone*6)})`;
}
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
  for(let depth=0;depth<columns+rows;depth++)for(let col=0;col<columns;col++){
    const row=depth-col;if(row<0||row>=rows)continue;
    const corners=tileCorners(col,row);
    polygon(ctx,corners,terrainCellColor(col,row));
    // A restrained, deterministic scatter gives the tilemap texture without repeating a tile image.
    const p=gridToScreen(col,row),seed=tileNoise(col,row,11),variation=tileNoise(col,row,23);
    if(!ROAD_CELLS.has(`${col},${row}`)&&seed<.53){
      const x=p.x+(tileNoise(col,row,31)-.5)*15,y=p.y+(tileNoise(col,row,47)-.5)*6;
      ctx.fillStyle=variation<.12?'rgba(226,202,126,.66)':'rgba(54,91,48,.30)';
      ctx.beginPath();ctx.ellipse(x,y,variation<.12?1.15:1.1+variation,1.7+variation*1.8,-.3+variation*.5,0,Math.PI*2);ctx.fill();
      if(variation>.82){ctx.strokeStyle='rgba(57,91,51,.46)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-2,y+2);ctx.lineTo(x-3,y-1);ctx.moveTo(x,y+2);ctx.lineTo(x+1,y-2);ctx.stroke();}
    }
    // Soil walls are drawn only on the exposed southeast/southwest edges of the tile map.
    if(!inGrid(col+1,row)){const edge=[corners[1],corners[2],{x:corners[2].x,y:corners[2].y+soilDepth},{x:corners[1].x,y:corners[1].y+soilDepth}];polygon(ctx,edge,'#8b5b3a','#704a32',.6);}
    if(!inGrid(col,row+1)){const edge=[corners[2],corners[3],{x:corners[3].x,y:corners[3].y+soilDepth},{x:corners[2].x,y:corners[2].y+soilDepth}];polygon(ctx,edge,'#785033','#63432e',.6);}
  }
  drawRoads(ctx);
}
function inGrid(col,row){return col>=0&&col<columns&&row>=0&&row<rows;}
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
  if(grid.col>2.2&&grid.col<8.7&&grid.row>9.3)return {id:'crop-field',type:'crop',name:'Soybean field'};
  return null;
}
export function productFarmHoverEntityAt(x,y){return productFarmEntityAt(x,y);}

export function drawProductFarm(ctx,{drawAsset,assetsReady,time=0,animals=[],drawAnimal=()=>{},selectedEntityId=null,hoverEntityId=null}){
  ctx.fillStyle='#e7eadb';ctx.fillRect(0,0,576,336);drawTerrain(ctx);drawPastureZones(ctx,selectedEntityId,hoverEntityId);
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
