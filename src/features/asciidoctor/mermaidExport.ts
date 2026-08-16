import {
  MERMAID_SOURCE_DATA_URI_PREFIX,
  mermaidClientRenderScript,
} from '../preview/mermaid.js'

// The preview loads Mermaid as a webview resource bundled with the extension;
// an exported HTML file has no such thing, so it needs a URL that works when
// the file is opened directly in a browser — a CDN, matching the bundled
// version (package.json).
const MERMAID_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs'

function mermaidExportScript(): string {
  return `<script type="module">
import mermaid from '${MERMAID_CDN_URL}';
mermaid.initialize({ startOnLoad: false });
${mermaidClientRenderScript()}
renderMermaidImages([document.body]);
</script>`
}

/**
 * Inject the Mermaid rendering script into HTML export output when it
 * contains a `[mermaid]` block, so the diagram — currently a data URI `<img>`
 * that no browser can render, see mermaid.ts — actually shows up when the
 * exported file is opened. No-op when there is no Mermaid block, or when the
 * script has already been injected (idempotent).
 */
export function addMermaidToHtmlExport(html: string): string {
  if (
    !html.includes(MERMAID_SOURCE_DATA_URI_PREFIX) ||
    html.includes(MERMAID_CDN_URL)
  ) {
    return html
  }
  const script = `\n${mermaidExportScript()}\n`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${html}${script}`
}
