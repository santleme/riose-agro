import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCT_BLOCKOUT, PRODUCT_WORLD, PRODUCT_PREFABS, SIMULATOR_PATCH_BOUNDS, SIMULATOR_BARN_BOUNDS, worldToScreen, screenToWorld, displayToScenePoint, assetGeometry, animalWorldPosition, separateAnimalVisuals, validateProductBlockout, validateAnimalPlacement, validateAnimalMovement} from '../src/client/product-spatial.js';
import {productFarmEntityAt} from '../src/client/product-scene.js';
import {FarmEngine} from '../src/client/engine.js';
import {createServer} from '../src/server/server.js';

const manifest=JSON.parse(await readFile(new URL('../public/assets/manifest.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(PRODUCT_BLOCKOUT);

test('logical grid and screen projection invert without render-size assumptions',()=>{
  for(let x=0;x<=PRODUCT_WORLD.width;x+=.25)for(let y=0;y<=PRODUCT_WORLD.height;y+=.25){const screen=worldToScreen(x,y);const world=screenToWorld(screen.x,screen.y);assert.ok(Math.abs(world.x-x)<1e-9);assert.ok(Math.abs(world.y-y)<1e-9);}
});

test('pointer conversion remains consistent at different CSS sizes and DPR-independent canvas sizes',()=>{
  for(const [width,height] of [[800,416],[1200,624],[360,187.2]]){
    const point=displayToScenePoint(25+width*.375,40+height*.625,{left:25,top:40,width,height});
    assert.ok(Math.abs(point.x-300)<1e-9);assert.ok(Math.abs(point.y-260)<1e-9);
  }
});

test('manifest geometry keeps footprint, anchor, collision and sprite dimensions distinct',()=>{
  const asset=manifest.assets.find(item=>item.id==='building-farmhouse-imagegen-v1');
  const geometry=assetGeometry(asset,{x:3,y:4,footprint:[4,3]});
  assert.deepEqual(geometry.position,{x:3,y:4});assert.deepEqual(geometry.footprint,[4,3]);
  assert.deepEqual(geometry.pivot,asset.anchor);assert.deepEqual(geometry.sprite,{width:172,height:128});
  assert.deepEqual(geometry.placementRules,asset.placementRules);assert.equal(geometry.selectionBounds.width,4);
  assert.equal(PRODUCT_WORLD.unit,'cell');assert.ok(!('metersPerCell' in PRODUCT_WORLD));
});

test('approved blockout has no occupied overlap, structures stay inside and all routes/gates validate',()=>{
  const result=validateProductBlockout(PRODUCT_BLOCKOUT,manifest);
  assert.equal(result.valid,true,JSON.stringify(result.issues));assert.deepEqual(result.issues,[]);assert.deepEqual(result.visualWarnings,[]);
  assert.equal(result.summary.footprints,9);assert.equal(result.summary.paths,4);assert.equal(result.summary.gates,5);
  assert.equal(PRODUCT_BLOCKOUT.zones.length,5);
  assert.equal(PRODUCT_BLOCKOUT.zones.filter(zone=>Number.isInteger(zone.patch)).length,4);
  assert.ok(PRODUCT_BLOCKOUT.paths.every(path=>path.cells.length>=2));
});

test('validator catches footprint overlap and structures outside the diorama',()=>{
  const overlap=clone();overlap.structures.push({...overlap.structures[0],id:'overlap-copy',x:18,y:2});
  assert.ok(validateProductBlockout(overlap,manifest).issues.some(issue=>issue.code==='footprint-overlap'));
  const tooClose=clone();tooClose.structures.find(item=>item.id==='pond').x=21;
  assert.ok(validateProductBlockout(tooClose,manifest).issues.some(issue=>issue.code==='clearance-overlap'));
  const outside=clone();outside.structures[0].x=PRODUCT_WORLD.width;
  assert.ok(validateProductBlockout(outside,manifest).issues.some(issue=>issue.code==='out-of-bounds'));
});

test('validator catches disconnected route, bad gate and paths blocked by a structure',()=>{
  const disconnected=clone();disconnected.paths[0].cells=disconnected.paths[0].cells.filter((_,i)=>i!==4);
  assert.ok(validateProductBlockout(disconnected,manifest).issues.some(issue=>issue.code==='path-network-disconnected'));
  const gate=clone();gate.gates[0].a.x+=.2;
  assert.ok(validateProductBlockout(gate,manifest).issues.some(issue=>issue.code==='gate-misaligned'));
  const blocked=clone();blocked.paths[0].cells.push([18,2]);
  assert.ok(validateProductBlockout(blocked,manifest).issues.some(issue=>issue.code==='path-blocked'));
});

test('animal patch mapping preserves simulator state and stays inside its assigned paddock',()=>{
  for(let patch=0;patch<4;patch++){
    const bounds=SIMULATOR_PATCH_BOUNDS[patch],animal={id:patch+1,patch,x:bounds.x+bounds.w*.7,y:bounds.y+bounds.h*.6};
    const before={...animal},position=animalWorldPosition(animal);
    const zone=PRODUCT_BLOCKOUT.zones.find(item=>item.patch===patch);
    assert.ok(position.x>=zone.x&&position.x<=zone.x+zone.w);assert.ok(position.y>=zone.y&&position.y<=zone.y+zone.h);
    assert.deepEqual(animal,before);
    const hit=productFarmEntityAt(...Object.values(worldToScreen(position.x,position.y)));
    assert.ok(hit===null||hit.id===zone.id);
  }
});

test('scene object selection follows the same projected footprint anchor',()=>{
  const entity=PRODUCT_BLOCKOUT.structures.find(item=>item.id==='farmstead'),center=worldToScreen(entity.x+entity.w/2,entity.y+entity.h/2);
  assert.equal(productFarmEntityAt(center.x,center.y)?.id,'farmstead');
  const pasture=PRODUCT_BLOCKOUT.zones.find(item=>item.patch===2),point=worldToScreen(pasture.x+pasture.w/2,pasture.y+pasture.h/2);
  assert.equal(productFarmEntityAt(point.x,point.y)?.id,pasture.id);
  const gate=PRODUCT_BLOCKOUT.gates[0],gatePoint=worldToScreen((gate.a.x+gate.b.x)/2,(gate.a.y+gate.b.y)/2);
  assert.equal(productFarmEntityAt(gatePoint.x,gatePoint.y)?.id,gate.id);
});

test('confinement coordinates map into an animal-only pen while patch state remains unchanged',()=>{
  const animal={id:42,patch:2,x:SIMULATOR_BARN_BOUNDS.x+SIMULATOR_BARN_BOUNDS.w*.6,y:SIMULATOR_BARN_BOUNDS.y+SIMULATOR_BARN_BOUNDS.h*.5},before={...animal};
  const placed=validateAnimalPlacement(animal,'barn');
  assert.equal(placed.valid,true);assert.equal(placed.position.zoneId,'working-pen');assert.equal(placed.position.sourcePatch,2);assert.deepEqual(animal,before);
  assert.equal(validateAnimalMovement(animal,{...animal,x:animal.x+1},'barn').valid,true);
  assert.ok(validateAnimalMovement(animal,{...animal,patch:3},'barn').issues.some(issue=>issue.code==='animal-crossed-paddock-without-transfer'));
  assert.ok(validateAnimalMovement(animal,{...animal,x:SIMULATOR_BARN_BOUNDS.x-1},'barn').issues.some(issue=>issue.code==='animal-outside-source-paddock'));
});

test('animal visual packing is deterministic and never changes modeled positions or patch assignments',()=>{
  const herd=Array.from({length:16},(_,index)=>({animal:{id:index+1,patch:index%4},x:4.5+(index%4)*.01,y:3.2+Math.floor(index/4)*.01,zone:PRODUCT_BLOCKOUT.zones[index%4]}));
  const packed=separateAnimalVisuals(herd),again=separateAnimalVisuals(herd);
  assert.deepEqual(packed.map(({x,y})=>[x,y]),again.map(({x,y})=>[x,y]));
  for(const item of packed){assert.equal(item.animal.patch,herd[item.animal.id-1].animal.patch);assert.deepEqual(item.modelPosition,{x:herd[item.animal.id-1].x,y:herd[item.animal.id-1].y});assert.ok(item.x>=item.zone.x&&item.x<=item.zone.x+item.zone.w);assert.ok(item.y>=item.zone.y&&item.y<=item.zone.y+item.zone.h);}
});

test('24 confined animals remain individually spaced inside the holding pen without changing model state',()=>{
  const engine=new FarmEngine();
  engine.configure({housing:'barn'});
  engine.tick(1);
  const source=engine.state.animals,before=structuredClone(engine.state.animals),zone=PRODUCT_BLOCKOUT.zones.find(item=>item.id==='working-pen');
  assert.ok(source.every(animal=>animal.x>=SIMULATOR_BARN_BOUNDS.x&&animal.x<=SIMULATOR_BARN_BOUNDS.x+SIMULATOR_BARN_BOUNDS.w&&animal.y>=SIMULATOR_BARN_BOUNDS.y&&animal.y<=SIMULATOR_BARN_BOUNDS.y+SIMULATOR_BARN_BOUNDS.h));
  const mapped=source.map(animal=>({animal,...animalWorldPosition(animal,undefined,'barn'),zone}));
  const positioned=separateAnimalVisuals(mapped);
  const screen=positioned.map(item=>worldToScreen(item.x,item.y));
  let minDistance=Infinity;
  for(let i=0;i<screen.length;i++)for(let j=i+1;j<screen.length;j++)minDistance=Math.min(minDistance,Math.hypot(screen[i].x-screen[j].x,screen[i].y-screen[j].y));
  assert.equal(positioned.length,24);assert.ok(minDistance>=20,`closest pair is ${minDistance.toFixed(2)}px`);
  for(const [index,item] of positioned.entries()){
    assert.equal(item.zoneId,'working-pen');assert.equal(item.sourcePatch,item.animal.patch);
    assert.ok(item.x>=zone.x+.5&&item.x<=zone.x+zone.w-.5);
    assert.ok(item.y>=zone.y+.5&&item.y<=zone.y+zone.h-.5);
    assert.equal(item.modelPosition.x,mapped[index].x);assert.equal(item.modelPosition.y,mapped[index].y);
  }
  assert.deepEqual(source,before);
});

test('composition editor is a development-only tool and is not linked from the Product page',async()=>{
  const html=await readFile(new URL('../tools/product-composer.html',import.meta.url),'utf8');
  const product=await readFile(new URL('../product.html',import.meta.url),'utf8');
  const productCss=await readFile(new URL('../product.css',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/client/product-app.js',import.meta.url),'utf8');
  const editor=await readFile(new URL('../tools/product-composer.js',import.meta.url),'utf8');
  assert.match(html,/Exportar JSON/);assert.match(html,/Editor de composição/);assert.doesNotMatch(product,/product-composer/);
  assert.match(productCss,/\.product-body #map\{[^}]*image-rendering:auto/);
  assert.match(app,/id==='livestock-approved'/);assert.doesNotMatch(editor,/new Image\(/);
});

test('development editor route is unavailable in production',async()=>{
  const listen=async env=>{const server=createServer({env});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,url:`http://127.0.0.1:${server.address().port}/tools/product-composer.html`};};
  const dev=await listen({NODE_ENV:'development'});
  try{const response=await fetch(dev.url);assert.equal(response.status,200);assert.match(await response.text(),/Editor de composição/);}finally{await new Promise(resolve=>dev.server.close(resolve));}
  const prod=await listen({NODE_ENV:'production'});
  try{const response=await fetch(prod.url);assert.equal(response.status,404);}finally{await new Promise(resolve=>prod.server.close(resolve));}
});
