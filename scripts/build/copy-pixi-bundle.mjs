import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(root, 'node_modules/pixi.js/dist/pixi.min.mjs');
const target = resolve(root, 'public/assets/scenario-editor/vendor/pixi.min.mjs');
await mkdir(dirname(target), {recursive: true});
await copyFile(source, target);
process.stdout.write(`PixiJS browser bundle copied from ${source}\n`);
