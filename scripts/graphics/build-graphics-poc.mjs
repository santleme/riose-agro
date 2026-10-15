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
console.log('Built graphics-poc/dist/app.js');
