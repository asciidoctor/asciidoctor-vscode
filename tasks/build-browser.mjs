import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const replaceAntoraDocumentPlugin = {
  name: 'replace-antora-document',
  setup(build) {
    const replacements = new Map([
      ['antoraDocument.js', 'antoraDocumentBrowserShim.ts'],
      ['mermaidExport.js', 'mermaidExport.browser.ts'],
    ])
    const escapedReplacements = [...replacements.keys()].map((m) =>
      m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    const filter = new RegExp(`(${escapedReplacements.join('|')})$`)
    build.onResolve({ filter }, (args) => {
      for (const [from, to] of replacements) {
        if (args.path.endsWith(from)) {
          return {
            path: path.resolve(args.resolveDir, args.path.replace(from, to)),
          }
        }
      }
    })
  },
}

const emptyModulePlugin = {
  name: 'empty-modules',
  setup(build) {
    const modules = [
      'node:fs',
      'node:fs/promises',
      'node:assert',
      'node:http',
      'node:https',
      'node:url',
      'node:stream',
      'node:child_process',
      'node:child_process',
    ]
    const escapedModules = modules.map((m) => m.replace(/[/]/g, '\\/'))
    const filter = new RegExp(`^(${escapedModules.join('|')})$`)
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
    'node:os': 'os-browserify/browser',
    'node:path': 'path-browserify',
    util: 'util',
    querystring: 'querystring',
    tty: 'tty-browserify',
    worker_threads: 'worker-thread',
  },
  define: {
    __L10N_BUNDLE__: await fs
      .readFile(path.join(__dirname, '..', 'l10n', 'bundle.l10n.json'), 'utf8')
      .then((content) => content.trim()),
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
// Override "type": "module" from root package.json so the CJS bundle is loaded correctly
// by VS Code's web worker extension host
await fs.writeFile(
  path.join(root, 'dist', 'browser', 'package.json'),
  JSON.stringify({ type: 'commonjs' }),
)
await copyAssets(path.join(root, 'src'), path.join(root, 'dist', 'browser'))
