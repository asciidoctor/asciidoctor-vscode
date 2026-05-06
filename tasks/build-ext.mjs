import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: { 'src/extension': './src/extension.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: './dist',
  sourcemap: true,
  packages: 'external',
})
