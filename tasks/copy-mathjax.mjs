// Copy the MathJax 4 runtime and its CommonHTML font into media/mathjax.
//
// We ship the `tex-mml-chtml-mathjax-newcm` combined component, which bundles
// the TeX + MathML input jax, the CommonHTML output jax and the default
// `mathjax-newcm` font definition, so nothing is fetched from a CDN at runtime
// (the preview WebView is offline and runs under a strict Content-Security-
// Policy). On top of that the MathJax loader lazily fetches, relative to the
// component's base URL:
//   - `input/asciimath.js`            — AsciiMath input is in no combined build
//   - `output/fonts/mathjax-newcm/…`  — woff2 files + dynamic character ranges
//
// Implemented in Node (rather than `cp`/`mkdir -p`) so it works on Windows,
// matching tasks/copy-mermaid.mjs.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const nodeModules = join(process.cwd(), 'node_modules')
const dest = join(process.cwd(), 'media', 'mathjax')
const mathjax = join(nodeModules, 'mathjax')
const font = join(nodeModules, '@mathjax', 'mathjax-newcm-font')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
// Keep the (otherwise git-ignored) media/mathjax directory tracked.
writeFileSync(join(dest, '.gitkeep'), '')

// Combined component: TeX + MathML + CommonHTML + bundled mathjax-newcm font.
cpSync(
  join(font, 'tex-mml-chtml-mathjax-newcm.js'),
  join(dest, 'tex-mml-chtml-mathjax-newcm.js'),
)

// AsciiMath input jax, lazy-loaded from `<base>/input/asciimath.js`.
mkdirSync(join(dest, 'input'), { recursive: true })
cpSync(
  join(mathjax, 'input', 'asciimath.js'),
  join(dest, 'input', 'asciimath.js'),
)

// CommonHTML font assets, lazy-loaded from `[mathjax-newcm]`, which resolves to
// `<base>/output/fonts/mathjax-newcm`.
const fontDest = join(dest, 'output', 'fonts', 'mathjax-newcm', 'chtml')
mkdirSync(fontDest, { recursive: true })
cpSync(join(font, 'chtml', 'woff2'), join(fontDest, 'woff2'), {
  recursive: true,
})
cpSync(join(font, 'chtml', 'dynamic'), join(fontDest, 'dynamic'), {
  recursive: true,
})
