import {SIMULATOR_PATCH_BOUNDS,SIMULATOR_BARN_BOUNDS} from '../patch-bounds.js';
import {projectIso, unprojectIso} from '../visualization/isometric.js';
export {SIMULATOR_PATCH_BOUNDS,SIMULATOR_BARN_BOUNDS};

// Canonical Product scene space. One world unit is one logical grid cell; it
// intentionally has no conversion to metres until the farm model defines one.
export const PRODUCT_WORLD = Object.freeze({
  unit: 'cell', width: 34, height: 16,
  tile: {width: 26, height: 14}, origin: {x: 283, y: 32}, soilDepth: 18,
});
// Irregular playable land perimeter in world-grid coordinates. Keeping it as
// scene data prevents the renderer from framing the farm as a rectangular slab.
export const PRODUCT_WORLD_OUTLINE = Object.freeze([
  [0, 3], [2, 1], [5, 0], [12, 0], [15, 1], [19, 0], [29, 0], [32, 1], [34, 3],
  [33, 5], [34, 7], [33, 9], [34, 12], [32, 14], [29, 15], [24, 16], [18, 15],
  [13, 16], [8, 15], [4, 16], [1, 14], [0, 11], [1, 8], [0, 6],
]);
export const PRODUCT_CANVAS_SIZE=Object.freeze({width:800,height:416});
export const PRODUCT_PREFABS = Object.freeze({
  pasture: {footprint: [6, 4], physicalClearance: 0, visualClearance: 0},
  farmstead: {footprint: [4, 3], physicalClearance: 0.5, visualClearance: 0.4},
  barnCorral: {footprint: [4, 3], physicalClearance: 0, visualClearance: 0},
  holdingPen: {footprint: [8, 6], physicalClearance: 0, visualClearance: 0},
  pond: {footprint: [3, 2], physicalClearance: 0.5, visualClearance: 0.5},
  crops: {footprint: [4, 2], physicalClearance: 0.25, visualClearance: 0.2},
  path: {footprint: [1, 1], physicalClearance: 0, visualClearance: 0},
  livestock: {footprint: [1, 1], physicalClearance: 0.34, visualClearance: 0.72},
  treeCluster: {footprint: [2, 2], physicalClearance: 0.25, visualClearance: 0.5},
  fenceBoundary: {footprint: [1, 1], physicalClearance: 0, visualClearance: 0},
  service: {footprint: [2, 2], physicalClearance: 0.5, visualClearance: 0.3},
});

export const PRODUCT_PREFAB_RECIPES = Object.freeze({
  paddock:{footprint:'configurable pasture rectangle',parts:['ground zone','fence edges','one or more gate openings','patch index']},
  farmstead:{footprint:[4,3],parts:['building-farmhouse-imagegen-v1','yard clearance']},
  pond:{footprint:[3,2],parts:['water-pond-imagegen-v1','shore clearance']},
  barnCorral:{footprint:[4,3],parts:['building-shed-imagegen-v1','working-pen zone','corral gate']},
  crops:{footprint:[4,3],parts:['field-soybean-growing','field row zone']},
  treeCluster:{footprint:[2,2],parts:['approved tree variants','deterministic cluster points']},
  roadConnector:{footprint:'connected tile cells',parts:['main lane','yard spur','crop connector']},
  fenceBoundary:{footprint:'one grid edge',parts:['fence-wire-wood-post-imagegen-v1','gate opening']},
  service:{footprint:[2,2],parts:['asset selected by service role','utility connection point']},
});

// Editable blockout positions (cells), not screen coordinates. Placed assets
// are intentionally sparse; approved art is layered only after this plan passes.
export const PRODUCT_BLOCKOUT = {
  version: 1,
  world: PRODUCT_WORLD,
  zones: [
    {id:'paddock-a', kind:'pasture', patch:0, x:1, y:1, w:6, h:4},
    {id:'paddock-b', kind:'pasture', patch:1, x:8, y:1, w:6, h:4},
    {id:'paddock-c', kind:'pasture', patch:2, x:1, y:6, w:6, h:4},
    {id:'paddock-d', kind:'pasture', patch:3, x:8, y:6, w:6, h:4},
    {id:'working-pen', kind:'holdingPen', x:20, y:8, w:8, h:6},
  ],
  structures: [
    {id:'farmstead', kind:'farmstead', x:17, y:1, w:4, h:3, asset:'building-farmhouse-imagegen-v1', hero:true},
    {id:'pond', kind:'pond', x:24, y:2, w:3, h:2, asset:'water-pond-imagegen-v1'},
    {id:'barn-corral', kind:'barnCorral', x:16, y:9, w:4, h:3, asset:'building-shed-imagegen-v1', hero:true},
    {id:'crop-block', kind:'crops', x:29, y:8, w:5, h:3, asset:'field-soybean-growing'},
  ],
  // The spine connects the west paddock gates to the service yard and all hero zones.
  paths: [
    {id:'main-lane', destinations:['farmstead'], cells:[[7,3],[7,2],[7,1],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[14,1],[14,2],[14,3],[15,3],[15,4],[16,4]]},
    {id:'south-lane', cells:[[7,8],[7,9],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],[13,10],[14,10],[14,9],[14,8]]},
    {id:'yard-connector', destinations:['barn-corral'], cells:[[15,4],[15,5],[15,6],[15,7],[15,8],[14,8],[14,9],[14,10],[14,11],[15,10]]},
    {id:'crop-connector', destinations:['pond','crop-block'], cells:[[16,4],[17,4],[18,4],[19,4],[20,4],[21,4],[22,4],[23,4],[23,5],[23,6],[23,7],[24,7],[25,7],[26,7],[27,7],[28,7]]},
  ],
  gates: [
    {id:'gate-a', zone:'paddock-a', a:{x:7,y:2}, b:{x:7,y:3}, connects:'main-lane'},
    {id:'gate-b', zone:'paddock-b', a:{x:14,y:2}, b:{x:14,y:3}, connects:'main-lane'},
    {id:'gate-c', zone:'paddock-c', a:{x:7,y:7}, b:{x:7,y:8}, connects:'south-lane'},
    {id:'gate-d', zone:'paddock-d', a:{x:14,y:8}, b:{x:14,y:9}, connects:'south-lane'},
    {id:'yard-gate', zone:'working-pen', a:{x:23,y:8}, b:{x:24,y:8}, connects:'crop-connector'},
  ],
  // Decorative placements are part of the scene data, not renderer constants.
  // These are visual props only; they do not affect grazing or simulation state.
  vegetation: [
    {id:'tree-north-west', asset:'vegetation-tree-shade-imagegen-v1', x:1.6, y:2.8},
    {id:'tree-north-west-inner', asset:'vegetation-tree-shade-imagegen-v1', x:4, y:1.2},
    {id:'tree-north-mid', asset:'vegetation-tree-shade-imagegen-v1', x:11, y:.4},
    {id:'tree-north-east-inner', asset:'vegetation-tree-shade-imagegen-v1', x:15, y:1.6},
    {id:'tree-north-east', asset:'vegetation-tree-shade-imagegen-v1', x:23, y:.25},
    {id:'tree-east-inner', asset:'vegetation-tree-shade-imagegen-v1', x:30, y:1},
    {id:'tree-east', asset:'vegetation-tree-shade-imagegen-v1', x:32, y:3},
    {id:'tree-west', asset:'vegetation-tree-shade-imagegen-v1', x:1, y:12},
    {id:'tree-south-west', asset:'vegetation-tree-shade-imagegen-v1', x:7, y:14},
    {id:'tree-south-mid', asset:'vegetation-tree-shade-imagegen-v1', x:15, y:15},
    {id:'tree-south-east-inner', asset:'vegetation-tree-shade-imagegen-v1', x:25, y:14},
    {id:'tree-east-south', asset:'vegetation-tree-shade-imagegen-v1', x:31, y:11},
  ],
};

export function worldToScreen(x, y, world = PRODUCT_WORLD) {
  return projectIso(x, y, world.tile.width, world.tile.height, world.origin);
}

export function productWorldOutline(scene = PRODUCT_BLOCKOUT) {
  const world = scene.world ?? PRODUCT_WORLD;
  const scaleX = world.width / PRODUCT_WORLD.width, scaleY = world.height / PRODUCT_WORLD.height;
  return PRODUCT_WORLD_OUTLINE.map(([x, y]) => ({x: x * scaleX, y: y * scaleY}));
}

// Only the southern half of the contour gets a visible soil face in this
// 2.5D view. This preserves the island edge without drawing a closed display
// frame around the whole map.
export function productWorldFrontEdges(scene = PRODUCT_BLOCKOUT) {
  const world = scene.world ?? PRODUCT_WORLD;
  const points = productWorldOutline(scene).map(point => worldToScreen(point.x, point.y, world));
  const middleY = (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y))) / 2;
  return points.flatMap((from, index) => {
    const to = points[(index + 1) % points.length];
    if ((from.y + to.y) / 2 < middleY) return [];
    return [{from, to, shade: to.x < from.x ? 'side' : 'front'}];
  });
}

// Scene-derived ground placements form a small, deterministic tile layer. An
// explicit terrainTiles array can replace this generator when an authored map
// is connected; the fallback keeps the current blockout reproducible.
export function productGroundTiles(scene = PRODUCT_BLOCKOUT) {
  if (Array.isArray(scene.terrainTiles) && scene.terrainTiles.length) {
    return scene.terrainTiles.map(tile => ({
      id: tile.id ?? `ground-${tile.x}-${tile.y}`,
      assetId: tile.assetId ?? 'grass-light',
      x: tile.x,
      y: tile.y,
      zoneId: tile.zoneId ?? null,
    }));
  }
  const tiles = new Map(), world = scene.world ?? PRODUCT_WORLD;
  for (const zone of scene.zones ?? []) {
    for (let y = Math.floor(zone.y); y < Math.ceil(zone.y + zone.h); y++) {
      for (let x = Math.floor(zone.x); x < Math.ceil(zone.x + zone.w); x++) {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
        const hash = (x * 37 + y * 71 + x * y * 13) % 101;
        tiles.set(`${x},${y}`, {
          id: `ground-${x}-${y}`,
          assetId: hash > 77 ? 'grass-mid' : 'grass-light',
          x,
          y,
          zoneId: zone.id,
        });
      }
    }
  }
  return [...tiles.values()].sort((a, b) => a.x + a.y - b.x - b.y || a.y - b.y || a.x - b.x);
}

// The current fence art is a composed multi-post section, not a one-cell edge
// tile. Return continuous, gate-aware runs for connected line rendering.
export function productFenceRuns(scene = PRODUCT_BLOCKOUT) {
  const runs = [];
  for (const zone of scene.zones ?? []) {
    const edges = [
      {id: 'north', axis: 'x', fixed: zone.y, start: zone.x, length: zone.w},
      {id: 'east', axis: 'y', fixed: zone.x + zone.w, start: zone.y, length: zone.h},
      {id: 'south', axis: 'x', fixed: zone.y + zone.h, start: zone.x, length: zone.w},
      {id: 'west', axis: 'y', fixed: zone.x, start: zone.y, length: zone.h},
    ];
    for (const edge of edges) {
      const end = edge.start + edge.length;
      const openings = (scene.gates ?? []).filter(gate => gate.zone === zone.id).flatMap(gate => {
        const [a, b] = [gate.a, gate.b];
        const aligned = edge.axis === 'x'
          ? Math.abs(a.y - edge.fixed) < 1e-6 && Math.abs(b.y - edge.fixed) < 1e-6
          : Math.abs(a.x - edge.fixed) < 1e-6 && Math.abs(b.x - edge.fixed) < 1e-6;
        if (!aligned) return [];
        const from = Math.max(edge.start, Math.min(a[edge.axis], b[edge.axis]));
        const to = Math.min(end, Math.max(a[edge.axis], b[edge.axis]));
        return to - from > 1e-6 ? [{from, to}] : [];
      }).sort((a, b) => a.from - b.from);
      const spans = [];
      let cursor = edge.start;
      for (const opening of openings) {
        if (opening.from > cursor + 1e-6) spans.push([cursor, opening.from]);
        cursor = Math.max(cursor, opening.to);
      }
      if (cursor < end - 1e-6) spans.push([cursor, end]);
      for (const [from, to] of spans) {
        const start = edge.axis === 'x' ? {x: from, y: edge.fixed} : {x: edge.fixed, y: from};
        const finish = edge.axis === 'x' ? {x: to, y: edge.fixed} : {x: edge.fixed, y: to};
        runs.push({id: `fence-${zone.id}-${edge.id}-${from}-${to}`, zoneId: zone.id, edge: edge.id, from: start, to: finish, length: to - from});
      }
    }
  }
  return runs;
}

export function screenToWorld(x, y, world = PRODUCT_WORLD) {
  const point = unprojectIso(x, y, world.tile.width, world.tile.height, world.origin);
  return {x: point.column, y: point.row};
}
export function displayToScenePoint(clientX,clientY,bounds,size=PRODUCT_CANVAS_SIZE){
  return {x:(clientX-bounds.left)*size.width/bounds.width,y:(clientY-bounds.top)*size.height/bounds.height};
}
export function worldToGrid(x,y){return {col:Math.round(x),row:Math.round(y)};}
export function gridToWorld(col,row){return {x:col,y:row};}

export function assetGeometry(asset, placement = {}) {
  const footprint=placement.footprint ?? asset?.footprint ?? [1,1];
  const anchor=placement.anchor ?? asset?.anchor ?? {x:.5,y:1};
  const dimensions=placement.dimensions ?? asset?.displaySize ?? [1,1];
  const visualPosition={x:placement.x??placement.col??0,y:placement.y??placement.row??0};
  return {position:{x:visualPosition.x,y:visualPosition.y},footprint:[...footprint],pivot:anchor,
    sprite:{width:dimensions[0],height:dimensions[1]},
    selectionBounds:{width:Math.max(1,footprint[0]),height:Math.max(1,footprint[1])},
    collision:placement.collision ?? asset?.collision ?? null,
    placementRules:placement.placementRules ?? asset?.placementRules ?? {mode:'footprint',collision:false,autoTile:null}};
}

const bounds=(item)=>({x:item.x,y:item.y,w:item.w,h:item.h});
const overlap=(a,b)=>a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
const inside=(a,w)=>a.x>=0&&a.y>=0&&a.x+a.w<=w.width&&a.y+a.h<=w.height;
const pad=(a,d)=>({x:a.x-d,y:a.y-d,w:a.w+2*d,h:a.h+2*d});

function connectedPath(scene, from, to) {
  const cells=new Set(scene.paths.flatMap(path=>path.cells).map(([x,y])=>`${x},${y}`));
  const start=`${Math.floor(from.x)},${Math.floor(from.y)}`; if (!cells.has(start)) return false;
  const queue=[start],visited=new Set(queue);
  for(let i=0;i<queue.length;i++){
    const [x,y]=queue[i].split(',').map(Number);
    if(Math.abs(x+.5-to.x)+Math.abs(y+.5-to.y)<=1.6)return true;
    for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const key=`${nx},${ny}`;if(cells.has(key)&&!visited.has(key)){visited.add(key);queue.push(key);}}
  }
  return false;
}

export function validateProductBlockout(scene=PRODUCT_BLOCKOUT, manifest={assets:[]}) {
  const issues=[], assets=new Map((manifest.assets??[]).map(asset=>[asset.id,asset]));
  const world=scene.world??PRODUCT_WORLD;
  const occupied=[...(scene.zones??[]),...(scene.structures??[])];
  const visualWarnings=[];
  for(const item of occupied){
    const area=bounds(item);
    if(!inside(area,world))issues.push({code:'out-of-bounds',entity:item.id,area});
    const asset=assets.get(item.asset);
    if(item.asset&&!asset)issues.push({code:'asset-missing-from-manifest',entity:item.id,asset:item.asset});
    // Reads manifest footprint/placement contract, then prefab footprint defines real space
    // when legacy art metadata is the generic 1x1 default.
    const geometry=assetGeometry(asset,{...item,footprint:item.w&&item.h?[item.w,item.h]:undefined});
    if(geometry.placementRules?.collision===true && !geometry.collision)issues.push({code:'collision-hull-missing',entity:item.id});
  }
  for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++){
    const a=occupied[i],b=occupied[j];
    if(overlap(bounds(a),bounds(b)))issues.push({code:'footprint-overlap',entities:[a.id,b.id]});
    const ca=PRODUCT_PREFABS[a.kind]?.physicalClearance??0,cb=PRODUCT_PREFABS[b.kind]?.physicalClearance??0;
    if((ca||cb)&&overlap(pad(bounds(a),ca),pad(bounds(b),cb)))issues.push({code:'clearance-overlap',entities:[a.id,b.id],clearance:[ca,cb]});
    const va=PRODUCT_PREFABS[a.kind]?.visualClearance??0,vb=PRODUCT_PREFABS[b.kind]?.visualClearance??0;
    if((va||vb)&&overlap(pad(bounds(a),va),pad(bounds(b),vb)))visualWarnings.push({code:'visual-proximity',entities:[a.id,b.id],clearance:[va,vb]});
  }
  const paths=new Set((scene.paths??[]).flatMap(path=>path.cells.map(([x,y])=>`${x},${y}`)));
  for(const path of scene.paths??[])for(const [x,y] of path.cells){
    if(x<0||y<0||x>=world.width||y>=world.height)issues.push({code:'path-out-of-bounds',entity:path.id,cell:[x,y]});
    if((scene.structures??[]).some(item=>overlap({x,y,w:1,h:1},bounds(item))))issues.push({code:'path-blocked',entity:path.id,cell:[x,y]});
    if((scene.zones??[]).some(zone=>overlap({x:x+.2,y:y+.2,w:.6,h:.6},bounds(zone))))issues.push({code:'path-through-zone',entity:path.id,cell:[x,y]});
  }
  const firstCell=scene.paths?.[0]?.cells?.[0];
  if(firstCell){
    const start={x:firstCell[0]+.5,y:firstCell[1]+.5};
    for(const route of scene.paths??[])for(const [x,y] of route.cells)if(!connectedPath(scene,start,{x:x+.5,y:y+.5}))issues.push({code:'path-network-disconnected',entity:route.id,cell:[x,y]});
  }
  for(const gate of scene.gates??[]){
    const zone=scene.zones.find(item=>item.id===gate.zone)??scene.structures.find(item=>item.id===gate.zone);
    if(!zone){issues.push({code:'gate-zone-missing',entity:gate.id});continue;}
    const vertical=Math.abs(gate.a.x-gate.b.x)<1e-6&&Math.abs(Math.abs(gate.a.y-gate.b.y)-1)<1e-6;
    const horizontal=Math.abs(gate.a.y-gate.b.y)<1e-6&&Math.abs(Math.abs(gate.a.x-gate.b.x)-1)<1e-6;
    const onZoneEdge=vertical&&(Math.abs(gate.a.x-zone.x)<1e-6||Math.abs(gate.a.x-(zone.x+zone.w))<1e-6)&&Math.min(gate.a.y,gate.b.y)>=zone.y&&Math.max(gate.a.y,gate.b.y)<=zone.y+zone.h
      ||horizontal&&(Math.abs(gate.a.y-zone.y)<1e-6||Math.abs(gate.a.y-(zone.y+zone.h))<1e-6)&&Math.min(gate.a.x,gate.b.x)>=zone.x&&Math.max(gate.a.x,gate.b.x)<=zone.x+zone.w;
    if(!onZoneEdge)issues.push({code:'gate-misaligned',entity:gate.id});
    const center={x:(gate.a.x+gate.b.x)/2,y:(gate.a.y+gate.b.y)/2};
    const path=scene.paths.find(item=>item.id===gate.connects);
    const connects=Boolean(path?.cells.some(([x,y])=>Math.abs(x+.5-center.x)+Math.abs(y+.5-center.y)<=1.6));
    if(!connects)issues.push({code:'gate-path-disconnected',entity:gate.id});
  }
  for(const route of scene.paths??[])for(const destinationId of route.destinations??[]){
    const destination=scene.structures.find(item=>item.id===destinationId);
    if(destination){const touches=route.cells.some(([x,y])=>{const cx=x+.5,cy=y+.5,dx=Math.max(destination.x-cx,0,cx-(destination.x+destination.w)),dy=Math.max(destination.y-cy,0,cy-(destination.y+destination.h));return dx+dy<=1.05;});if(!touches)issues.push({code:'path-destination-disconnected',entity:route.id,destination:destinationId});}
  }
  return {valid:issues.length===0,issues,visualWarnings,summary:{footprints:occupied.length,paths:scene.paths?.length??0,gates:scene.gates?.length??0,unit:world.unit}};
}

// Model coordinates stay untouched. The patch bounds map each simulator's own
// legacy rectangle into exactly its corresponding logical paddock.
export function animalWorldPosition(animal, simulatorBounds = SIMULATOR_PATCH_BOUNDS, housing='pasture') {
  const confined=housing==='barn';
  const zone=PRODUCT_BLOCKOUT.zones.find(item=>confined?item.id==='working-pen':item.patch===animal.patch);
  const source=confined?SIMULATOR_BARN_BOUNDS:simulatorBounds?.[animal.patch];
  if(!zone||!source||animal.patch<0||animal.patch>3||animal.x<source.x||animal.x>source.x+source.w||animal.y<source.y||animal.y>source.y+source.h)return null;
    const margin=.55;
  const nx=Math.max(0,Math.min(1,(animal.x-source.x)/source.w));
  const ny=Math.max(0,Math.min(1,(animal.y-source.y)/source.h));
  return {x:zone.x+margin+nx*(zone.w-2*margin),y:zone.y+margin+ny*(zone.h-2*margin),zoneId:zone.id,sourcePatch:animal.patch,housing};
}

export function validateAnimalPlacement(animal,housing='pasture'){
  const position=animalWorldPosition(animal,SIMULATOR_PATCH_BOUNDS,housing);
  if(!position)return {valid:false,issues:[{code:'animal-outside-source-paddock',animal:animal?.id,patch:animal?.patch}]};
  const radius=PRODUCT_PREFABS.livestock.physicalClearance;
  const collisions=PRODUCT_BLOCKOUT.structures.filter(item=>{const x=Math.max(item.x,Math.min(position.x,item.x+item.w)),y=Math.max(item.y,Math.min(position.y,item.y+item.h));return Math.hypot(position.x-x,position.y-y)<radius;});
  return {valid:collisions.length===0,position,issues:collisions.map(item=>({code:'animal-structure-collision',animal:animal.id,entity:item.id}))};
}

export function validateAnimalMovement(previous,next,housing='pasture'){
  const issues=[];
  if(previous.patch!==next.patch)issues.push({code:'animal-crossed-paddock-without-transfer',animal:next.id,from:previous.patch,to:next.patch});
  const placement=validateAnimalPlacement(next,housing);
  return {valid:issues.length===0&&placement.valid,position:placement.position,issues:[...issues,...placement.issues]};
}

function visualDistance(a,b){const dx=a.x-b.x,dy=a.y-b.y,screenX=(dx-dy)*PRODUCT_WORLD.tile.width/2,screenY=(dx+dy)*PRODUCT_WORLD.tile.height/2;return Math.hypot(screenX,screenY);}
export function separateAnimalVisuals(animals, minDistance=20) {
  const result=[];
  const ordered=[...animals].sort((a,b)=>a.animal.id-b.animal.id);
  const holding=ordered.filter(item=>item.zone.kind==='holdingPen'),holdingSlots=new Map();
  const columns=Math.max(1,Math.ceil(Math.sqrt(holding.length*8/6))),rows=Math.max(1,Math.ceil(holding.length/columns));
  const slotX=columns>1?7/(columns-1):0,slotY=rows>1?5/(rows-1):0;
  holding.forEach((item,index)=>{const column=index%columns,row=Math.floor(index/columns);holdingSlots.set(item.animal.id,{x:item.zone.x+.5+column*slotX,y:item.zone.y+.5+row*slotY});});
  for(const animal of ordered){
    const modelPosition={x:animal.x,y:animal.y};
    const source={x:Math.max(animal.zone.x+.55,Math.min(animal.zone.x+animal.zone.w-.55,animal.x)),y:Math.max(animal.zone.y+.55,Math.min(animal.zone.y+animal.zone.h-.55,animal.y))}; let chosen=source;
    if(animal.zone.kind==='holdingPen')chosen=holdingSlots.get(animal.animal.id)??source;
    const requiredDistance=animal.zone.kind==='holdingPen'?16:minDistance;
    if(animal.zone.kind!=='holdingPen'&&result.some(other=>other.zone.id===animal.zone.id&&visualDistance(other,source)<requiredDistance)){
      let found=false;
      for(let ring=1;ring<=12&&!found;ring++)for(let step=0;step<ring*8;step++){
        const angle=step/(ring*8)*Math.PI*2,candidate={x:source.x+Math.cos(angle)*ring*.22,y:source.y+Math.sin(angle)*ring*.22};
        if(candidate.x<animal.zone.x+.55||candidate.x>animal.zone.x+animal.zone.w-.55||candidate.y<animal.zone.y+.55||candidate.y>animal.zone.y+animal.zone.h-.55)continue;
        if(result.every(other=>other.zone.id!==animal.zone.id||visualDistance(other,candidate)>=requiredDistance)){chosen=candidate;found=true;break;}
      }
    }
    result.push({...animal,...chosen,modelPosition,displayOffset:{x:chosen.x-modelPosition.x,y:chosen.y-modelPosition.y}});
  }
  return result;
}
