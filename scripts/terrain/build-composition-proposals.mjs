import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'assets/previews/ranch-composition-v4/rural-diorama-scene-v4-grounding-v2-gate-v2-water-v2-feed-v2-review.json');
const outputDir = path.join(root, 'graphics-poc/generated/terrain-v5/composition-proposals');
await mkdir(outputDir, {recursive: true});
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const proposals = [
  {id: 'proposal-homestead-hub', label: 'Sede central · manejo no primeiro plano', description: 'Composição piloto preservada como referência de leitura.', shifts: {}},
  {id: 'proposal-service-corridor', label: 'Corredor de serviço compacto', description: 'Aproxima galpão, manejo e água de apoio ao eixo de circulação.', shifts: {
    'service-yard-block': [-180, 50], 'handling-block': [-150, -40], 'water-block': [60, -70], 'east-paddock-prefab': [-80, 0], 'monitoring-prefab': [-70, -50],
  }},
  {id: 'proposal-north-yard', label: 'Sede no alto · pátio de serviço ao centro', description: 'Leva a sede para o ombro norte e organiza galpão, manejo e água em uma sequência central.', shifts: {
    'homestead-block': [30, -80], 'service-yard-block': [-220, 15], 'handling-block': [-100, -135], 'water-block': [-20, -90], 'monitoring-prefab': [-180, -65],
  }},
];

function moved(scene, proposal) {
  const result = structuredClone(scene);
  const blocks = new Map(result.prefabs.map(block => [block.id, block]));
  const placementOwner = new Map();
  for (const block of result.prefabs) for (const item of block.placements) placementOwner.set(item.placementId, block.id);
  for (const [blockId, [dx, dy]] of Object.entries(proposal.shifts)) {
    const block = blocks.get(blockId);
    if (!block) throw new Error(`Unknown composition block ${blockId}`);
    block.originPx = [block.originPx[0] + dx, block.originPx[1] + dy];
    for (const zoneId of block.zoneIds) {
      const zone = result.zones.find(item => item.id === zoneId);
      if (zone) zone.polygon = zone.polygon.map(([x, y]) => [x + dx, y + dy]);
    }
  }
  for (const placement of result.placements) {
    const blockId = placementOwner.get(placement.placementId);
    const [dx, dy] = proposal.shifts[blockId] ?? [0, 0];
    placement.anchorPx = [placement.anchorPx[0] + dx, placement.anchorPx[1] + dy];
    placement.depthKey = placement.anchorPx[1];
    if (placement.anchorPx[0] < 0 || placement.anchorPx[0] > result.footprintPx[0] || placement.anchorPx[1] < 0 || placement.anchorPx[1] > result.footprintPx[1]) throw new Error(`${proposal.id} moves ${placement.placementId} outside the terrain.`);
  }
  // Soil wear is attached to the nearest prefab origin so overlays move with their semantic block.
  for (const overlay of result.groundingOverlays) {
    const nearest = result.prefabs.map(block => ({block, distance: Math.hypot(block.originPx[0] - overlay.centerPx[0], block.originPx[1] - overlay.centerPx[1])})).sort((a, b) => a.distance - b.distance)[0];
    if (nearest?.distance < 80) {
      const [dx, dy] = proposal.shifts[nearest.block.id] ?? [0, 0];
      overlay.centerPx = [overlay.centerPx[0] + dx, overlay.centerPx[1] + dy];
    }
  }
  result.proposal = {id: proposal.id, label: proposal.label, description: proposal.description, seed: 84018, terrainProposal: 'homestead-high-ground'};
  result.sceneId = `${scene.sceneId}-${proposal.id}`;
  return result;
}

const manifest = [];
for (const proposal of proposals) {
  const scene = moved(source, proposal);
  const fileName = `${proposal.id}.json`;
  await writeFile(path.join(outputDir, fileName), `${JSON.stringify(scene, null, 2)}\n`);
  manifest.push({id: proposal.id, label: proposal.label, description: proposal.description, scene: `graphics-poc/generated/terrain-v5/composition-proposals/${fileName}`, map: proposal.id.replace('proposal-', 'terrain-')});
}
const manifestPath = path.join(outputDir, 'proposals.json');
await writeFile(manifestPath, `${JSON.stringify({schemaVersion: 1, sourceSceneId: source.sceneId, seed: 84018, terrainProposal: 'homestead-high-ground', selection: 'pending-visual-review', proposals: manifest}, null, 2)}\n`);

for (const proposal of manifest) {
  const result = spawnSync('node', ['scripts/tiled/build-scene.mjs', proposal.scene, proposal.map], {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Tiled failed to compile ${proposal.id} (status ${result.status}).`);
}
console.log(JSON.stringify({proposals: manifest.map(item => ({id: item.id, scene: item.scene, map: item.map})), output: manifestPath}));
