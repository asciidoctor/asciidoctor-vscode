import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: {
    index: './preview-src/index.ts',
    pre: './preview-src/pre.ts',
  },
  bundle: true,
  minify: true,
  outdir: './dist',
  sourcemap: 'inline',
})
