import {readFile,writeFile} from 'node:fs/promises';
import {PRODUCT_BLOCKOUT,PRODUCT_WORLD,PRODUCT_PREFABS,PRODUCT_PREFAB_RECIPES,SIMULATOR_PATCH_BOUNDS,SIMULATOR_BARN_BOUNDS,validateProductBlockout} from '../src/client/product/spatial.js';

const manifest=JSON.parse(await readFile(new URL('../public/assets/manifest.json',import.meta.url),'utf8'));
const library=JSON.parse(await readFile(new URL('../assets/manifests/manifest.json',import.meta.url),'utf8'));
const validation=validateProductBlockout(PRODUCT_BLOCKOUT,manifest);
const assetMap=new Map(manifest.assets.map(asset=>[asset.id,asset]));
const approvedAsset=library.assets.find(asset=>asset.file==='assets/approved/livestock/nelore-adult-idle-v1.png');
const reservedAssetBindings=[...new Set([
  ...PRODUCT_BLOCKOUT.structures.map(item=>item.asset),
  'fence-wire-wood-post-imagegen-v1','fence-gate-wood-imagegen-v1','nelore-adult',
])].map(id=>{
  const asset=assetMap.get(id);if(!asset)return {id,missing:true,rendered:false};
  const sourceName=id==='nelore-adult'?'nelore-adult-idle-v1.png':`${id}.png`;
  const provenance=library.assets.find(item=>item.file.endsWith('/'+sourceName));
  const instance=PRODUCT_BLOCKOUT.structures.find(item=>item.asset===id);
  const factor=instance?(instance.hero?.72:.62):null;
  const runtimeDisplaySize=instance?asset.displaySize.map(value=>Math.round(value*factor*10)/10)
    :id==='fence-wire-wood-post-imagegen-v1'?[25,17]
      :id==='fence-gate-wood-imagegen-v1'?[32,21]
        :id==='nelore-adult'?[23,18]:asset.displaySize;
  return {id,atlas:asset.frame.atlas,atlasFramePx:{width:asset.frame.w,height:asset.frame.h},manifestFootprint:asset.footprint,sceneFootprint:instance?[instance.w,instance.h]:asset.footprint,anchor:asset.anchor,displaySize:asset.displaySize,runtimeDisplaySize,collision:asset.collision,placementRules:asset.placementRules,approval:provenance?.status??'not-approved-in-library-manifest',rendered:id==='nelore-adult'};
});
const report={scene:'product-blockout-v1',status:validation.valid?'valid-pending-visual-review':'invalid',world:{unit:PRODUCT_WORLD.unit,columns:PRODUCT_WORLD.width,rows:PRODUCT_WORLD.height,tile:PRODUCT_WORLD.tile,origin:PRODUCT_WORLD.origin,metersPerCell:null},counts:{pastures:PRODUCT_BLOCKOUT.zones.filter(item=>item.patch!==undefined).length,holdingPens:PRODUCT_BLOCKOUT.zones.filter(item=>item.kind==='holdingPen').length,structures:PRODUCT_BLOCKOUT.structures.length,paths:PRODUCT_BLOCKOUT.paths.length,gates:PRODUCT_BLOCKOUT.gates.length,occupiedFootprints:validation.summary.footprints},prefabs:PRODUCT_PREFAB_RECIPES,spacing:{physical:PRODUCT_PREFABS,visualWarnings:validation.visualWarnings},animals:{simulatorPatchBounds:SIMULATOR_PATCH_BOUNDS,barnBounds:SIMULATOR_BARN_BOUNDS,collisionRadiusCells:PRODUCT_PREFABS.livestock.physicalClearance,minimumVisualSpacingPx:20},artPolicy:{renderedApprovedAsset:approvedAsset?.id??null,renderedAssets:[{id:'nelore-adult',approval:approvedAsset?.status,displaySize:[23,18]}],reservedAssetBindings},validation:{valid:validation.valid,issues:validation.issues,visualWarnings:validation.visualWarnings}};
await writeFile(new URL('../docs/product-scene-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
process.stdout.write(`Product blockout ${validation.valid?'valid':'invalid'}: ${validation.issues.length} violations, ${validation.visualWarnings.length} visual proximity warnings\n`);
if(!validation.valid)process.exitCode=1;
