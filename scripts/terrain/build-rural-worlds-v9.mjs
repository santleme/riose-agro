import {readFile, writeFile} from 'node:fs/promises';
import {generateRuralWorld, RURAL_WORLD_V9_SPECS} from '../../src/client/rural-world-generator-v9.js';

const source = JSON.parse(await readFile('graphics-poc/scenes/farm-final-v8.json', 'utf8'));
for (const spec of RURAL_WORLD_V9_SPECS) {
  const scene = generateRuralWorld(source, spec);
  const filename = `graphics-poc/scenes/${spec.id}.json`;
  await writeFile(filename, `${JSON.stringify(scene, null, 2)}\n`);
  console.log(JSON.stringify({scene: filename, dimensions: spec.dimensions, animals: scene.generation.compiledHerdCount,
    modularFenceSegments: scene.prefabs.filter(item => item.modularType === 'fence-segment').length,
    gates: scene.prefabs.filter(item => item.modularType === 'fence-gate').length,
    roads: scene.terrainV8.routes.road.length, levels: [...new Set(scene.terrainV8.heightMap.flat())]}));
}
