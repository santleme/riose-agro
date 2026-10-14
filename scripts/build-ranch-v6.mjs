import {build} from 'esbuild';

await build({
  entryPoints: ['graphics-poc/ranch-v6.js'],
  outfile: 'graphics-poc/dist/ranch-v6.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});
console.log('Built graphics-poc/dist/ranch-v6.js');
