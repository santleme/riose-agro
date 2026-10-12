import {readFile, writeFile} from 'node:fs/promises';
import {createBeefFarmScene, createDairyFarmScene} from '../../public/assets/scenario-editor/scene-layout.js';

const prefabs = JSON.parse(await readFile(new URL('../../public/assets/scenario-editor/prefabs.json', import.meta.url), 'utf8'));
const scene = createDairyFarmScene(prefabs.prefabs);
const output = new URL('../../public/assets/scenarios/riose-dairy-sample.json', import.meta.url);
await writeFile(output, `${JSON.stringify(scene, null, 2)}\n`);
const beef = createBeefFarmScene(prefabs.prefabs);
const beefOutput = new URL('../../public/assets/scenarios/riose-beef-sample.json', import.meta.url);
await writeFile(beefOutput, `${JSON.stringify(beef, null, 2)}\n`);
process.stdout.write(`Saved dairy (${scene.placements.length} placements, ${scene.metadata.visibleAnimalCount} animals) and beef (${beef.placements.length} placements, ${beef.metadata.visibleAnimalCount} animals) scenes.\n`);
