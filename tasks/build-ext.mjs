import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await esbuild.build({
  entryPoints: { 'src/extension': './src/extension.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: './dist',
  outExtension: { '.js': '.mjs' },
  sourcemap: true,
  packages: 'external',
  define: {
    // Embed the default (English) l10n bundle so runtime strings resolve on the
    // desktop too. VS Code only loads a `bundle.l10n.<locale>.json` for
    // non-English display languages; in English it loads no bundle and
    // `vscode.l10n.t(key)` returns the key verbatim. `t()` (see src/core/l10n.ts)
    // falls back to this embedded bundle in that case — mirroring the browser
    // build (tasks/build-browser.mjs).
    __L10N_BUNDLE__: await fs
      .readFile(path.join(__dirname, '..', 'l10n', 'bundle.l10n.json'), 'utf8')
      .then((content) => content.trim()),
  },
})
