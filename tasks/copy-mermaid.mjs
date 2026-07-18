// Copy the Mermaid renderer and its external diagram add-ons into media/.
// Implemented in Node (rather than `cp`/`mkdir -p` shell commands) so it works
// on Windows, where cmd.exe resolves `mkdir`/`rm` to shell builtins that do not
// understand the `-p`/`-rf` flags.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const nodeModules = join(process.cwd(), 'node_modules')
const media = join(process.cwd(), 'media')

// The preview imports the ESM entry (`mermaid.esm.min.mjs`) and the `.mjs`
// chunks it lazily loads; that is all that runs at runtime. TypeScript
// declarations, source maps, the unused UMD builds (`mermaid.js`,
// `mermaid.min.js`) and READMEs are dev artifacts — ~63 MB for Mermaid alone —
// so keep them out of `media/` and the packaged VSIX.
function keep(src) {
  return (
    !src.endsWith('.d.ts') &&
    !src.endsWith('.map') &&
    !src.endsWith('.md') &&
    !/[/\\]mermaid(\.min)?\.js$/.test(src)
  )
}

function copy(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true, filter: keep })
}

// Full Mermaid bundle (lazy-loads its own diagram chunks).
copy(join(nodeModules, 'mermaid'), join(media, 'mermaid'))

// External add-ons: ship only the pre-bundled `.esm.min` entry and its chunks
// (the entry the preview imports), not the unused UMD/source-map variants.
const addons = [
  {
    pkg: '@mermaid-js/layout-elk',
    entry: 'mermaid-layout-elk.esm.min.mjs',
    chunks: 'mermaid-layout-elk.esm.min',
  },
  {
    pkg: '@mermaid-js/mermaid-zenuml',
    entry: 'mermaid-zenuml.esm.min.mjs',
    chunks: 'mermaid-zenuml.esm.min',
  },
]

for (const { pkg, entry, chunks } of addons) {
  const srcDist = join(nodeModules, pkg, 'dist')
  const destDist = join(media, pkg, 'dist')
  rmSync(join(media, pkg), { recursive: true, force: true })
  mkdirSync(join(destDist, 'chunks'), { recursive: true })
  cpSync(join(srcDist, entry), join(destDist, entry))
  cpSync(join(srcDist, 'chunks', chunks), join(destDist, 'chunks', chunks), {
    recursive: true,
    filter: keep,
  })
}

// The exported HTML is opened directly in a browser, outside the VS Code
// WebView and without the media/ directory. Use Mermaid's standalone browser
// build here: unlike the ESM entry, it has no dynamic imports, so inlining it
// into the exported HTML will not try to fetch diagram chunks from file://.
mkdirSync(join(media, 'mermaid', 'export'), { recursive: true })
cpSync(
  join(nodeModules, 'mermaid', 'dist', 'mermaid.min.js'),
  join(media, 'mermaid', 'export', 'mermaid-export.js'),
)
