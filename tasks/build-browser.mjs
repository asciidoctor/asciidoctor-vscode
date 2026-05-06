import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const replaceAntoraDocumentPlugin = {
  name: 'replace-antora-document',
  setup(build) {
    build.onResolve({ filter: /antoraDocument\.js$/ }, (args) => ({
      path: path.resolve(
        args.resolveDir,
        args.path.replace('antoraDocument.js', 'antoraDocumentBrowserShim.ts'),
      ),
    }))
  },
}

const emptyModulePlugin = {
  name: 'empty-modules',
  setup(build) {
    const modules = [
      'fs',
      'assert',
      'unxhr',
      'glob',
      'http',
      'https',
      'url',
      'zlib',
      'crypto',
      'stream',
      'child_process',
    ]
    const filter = new RegExp(`^(${modules.join('|')})$`)
    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: 'empty-module',
    }))
    build.onLoad({ filter: /.*/, namespace: 'empty-module' }, () => ({
      contents: 'module.exports = {}',
    }))
  },
}

await esbuild.build({
  entryPoints: { extension: './src/extension.ts' },
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  outdir: './dist/browser',
  sourcemap: true,
  tsconfig: 'tsconfig.browser.json',
  external: [
    'vscode',
    'applicationinsights-native-metrics',
    '@opentelemetry/tracing',
  ],
  alias: {
    os: 'os-browserify/browser',
    path: 'path-browserify',
    util: 'util',
    querystring: 'querystring',
    tty: 'tty-browserify',
    worker_threads: 'worker-thread',
  },
  inject: [path.join(__dirname, 'process-browser-shim.js')],
  plugins: [replaceAntoraDocumentPlugin, emptyModulePlugin],
})

// Copy non-TS assets from src/ to dist/browser/ (mirrors CopyWebpackPlugin behavior)
async function copyAssets(srcDir, destDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'test') {
        continue
      }
      await fs.mkdir(destPath, { recursive: true })
      await copyAssets(srcPath, destPath)
    } else if (!entry.name.endsWith('.ts')) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

const root = path.join(__dirname, '..')
await fs.mkdir(path.join(root, 'dist', 'browser'), { recursive: true })
await copyAssets(path.join(root, 'src'), path.join(root, 'dist', 'browser'))
