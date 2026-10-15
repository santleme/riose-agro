import {build} from 'esbuild';

await build({
  entryPoints: ['graphics-poc/app.js'],
  outfile: 'graphics-poc/dist/app.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});
await build({
  entryPoints: ['graphics-poc/ranch-v4.js'],
  outfile: 'graphics-poc/dist/ranch-v4.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});
await build({
  entryPoints: ['graphics-poc/spatial-debug.js'],
  outfile: 'graphics-poc/dist/spatial-debug.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});
await build({
  entryPoints: ['graphics-poc/rural-renderer-lab.js'],
  outfile: 'graphics-poc/dist/rural-renderer-lab.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});
console.log('Built graphics-poc application, spatial debug, and Pixi/Babylon rural renderer lab.');
