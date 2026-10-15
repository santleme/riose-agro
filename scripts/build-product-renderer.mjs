import {build} from 'esbuild';

await build({
  entryPoints: ['src/client/product-world-renderer.js'],
  outfile: 'src/client/product-world-renderer.bundle.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  legalComments: 'none',
});

console.log('Built src/client/product-world-renderer.bundle.js');
