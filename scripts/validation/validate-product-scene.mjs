import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = process.cwd();
const read = path => readFileSync(resolve(root, path), 'utf8');
const required = (text, expression, message) => {
  if (!expression.test(text)) throw new Error(message);
};

const page = read('product.html');
const view = read('src/client/farm-simulation-view.js');
const app = read('src/client/product-app.js');
const style = read('src/client/farm-simulation.css');

for (const [selector, label] of [
  ['welcome-farm-animals', 'illustrative welcome population'],
  ['farm-stage-animals', 'simulated population overlay'],
  ['farm-stage', 'interactive farm stage'],
  ['farm-play', 'timeline playback control'],
  ['timeline', 'population checkpoint input'],
  ['farm-pathways', 'scenario path inspector'],
]) {
  required(page, new RegExp(`id=["']${selector}["']`), `Missing ${label} mount point (#${selector}).`);
}

for (const asset of [
  'public/assets/product-farm/pasture-pixel.webp',
  'public/assets/product-farm/nelore-agent.png',
]) {
  if (!existsSync(resolve(root, asset))) throw new Error(`Missing Product scene asset: ${asset}`);
}

for (const [source, expression, message] of [
  [view, /export function renderWelcomeAnimals\s*\(/, 'Welcome population renderer is not exported.'],
  [view, /export function renderFarmAnimals\s*\(/, 'Engine population renderer is not exported.'],
  [view, /\/assets\/product-farm\/nelore-agent\.png/, 'The cattle sprite path changed without an asset update.'],
  [app, /renderWelcomeAnimals\(/, 'The welcome population is not mounted by the Product app.'],
  [app, /renderFarmAnimals\(/, 'Engine population states are not mounted by the Product app.'],
  [style, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Product scene does not respect reduced motion.'],
  [style, /\.farm-animal:hover/, 'Cattle hover interaction is missing.'],
]) {
  required(source, expression, message);
}

console.log('Product scene contract valid: assets, welcome herd, engine herd, timeline, paths, interactions, and reduced motion.');
