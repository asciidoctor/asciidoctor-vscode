import {
  PLANTUML_SOURCE_DATA_URI_PREFIX,
  plantUmlClientRenderScript,
  plantUmlEngineLoaderScript,
} from '../preview/plantuml.js'

// The preview loads PlantUML as a webview resource bundled with the extension;
// an exported HTML file has no such thing, so it needs a URL that works when
// the file is opened directly in a browser — a CDN, matching the bundled
// version (package.json).
export const PLANTUML_CORE_VERSION = '1.2026.7'
const PLANTUML_CDN_BASE = `https://cdn.jsdelivr.net/npm/@plantuml/core@${PLANTUML_CORE_VERSION}`
const PLANTUML_MODULE_CDN_URL = `${PLANTUML_CDN_BASE}/plantuml.js`

function plantUmlExportScript(): string {
  return `<script type="module">
${plantUmlEngineLoaderScript(`${PLANTUML_CDN_BASE}/viz-global.js`, PLANTUML_MODULE_CDN_URL)}
${plantUmlClientRenderScript()}
renderPlantUmlImages([document.body]);
</script>`
}

/**
 * Inject the PlantUML rendering script into HTML export output when it contains
 * a `[plantuml]` block, so the diagram — currently a data URI `<img>` that no
 * browser can render, see plantuml.ts — actually shows up when the exported file
 * is opened. No-op when there is no PlantUML block, or when the script has
 * already been injected (idempotent).
 */
export function addPlantUmlToHtmlExport(html: string): string {
  if (
    !html.includes(PLANTUML_SOURCE_DATA_URI_PREFIX) ||
    html.includes(PLANTUML_MODULE_CDN_URL)
  ) {
    return html
  }
  const script = `\n${plantUmlExportScript()}\n`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${html}${script}`
}
