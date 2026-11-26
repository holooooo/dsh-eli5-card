import { build } from 'esbuild';
await build({
  entryPoints:['client.js'], bundle:true, format:'iife', platform:'browser', target:'es2020', outfile:'client.bundle.js',
  external:['react'], minify:true, sourcemap:false,
});
