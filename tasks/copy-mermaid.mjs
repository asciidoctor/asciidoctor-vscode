// Copy the Mermaid renderer and its external diagram add-ons into media/.
// Implemented in Node (rather than `cp`/`mkdir -p` shell commands) so it works
// on Windows, where cmd.exe resolves `mkdir`/`rm` to shell builtins that do not
// understand the `-p`/`-rf` flags.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const nodeModules = join(process.cwd(), 'node_modules')
const media = join(process.cwd(), 'media')

function copy(src, dest) {
  rmSync(dest, { recursive: true, force: true })
  cpSync(src, dest, { recursive: true })
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
  })
}
