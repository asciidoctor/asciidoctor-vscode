import {
  decodePlantUmlDiagram,
  PLANTUML_SOURCE_DATA_URI_PREFIX,
  plantUmlClientRenderScript,
  plantUmlDiagramToHtml,
} from '../preview/plantuml.js'

const PLANTUML_CORE_VERSION = '1.2026.7'
const PLANTUML_CDN_BASE = `https://cdn.jsdelivr.net/npm/@plantuml/core@${PLANTUML_CORE_VERSION}`
const PLANTUML_VIZ_CDN_URL = `${PLANTUML_CDN_BASE}/viz-global.js`
const PLANTUML_MODULE_CDN_URL = `${PLANTUML_CDN_BASE}/plantuml.js`

function plantUmlExportScript(): string {
  return `<script src="${PLANTUML_VIZ_CDN_URL}"></script>
<script type="module">
import { render } from '${PLANTUML_MODULE_CDN_URL}';
${plantUmlClientRenderScript()}
renderPlantUmlDiagrams([document.body]);
</script>`
}

const PLANTUML_IMAGE_BLOCK_PATTERN =
  /<div([^>]*) class=(["'])([^"']*\bimageblock\b[^"']*)\2([^>]*)>\s*<div class=(["'])content\5>\s*<img\b[^>]*\bsrc=(["'])(data:application\/vnd\.asciidoctor-vscode\.plantuml\+json;base64,[^"']+)\6[^>]*>\s*<\/div>(\s*<div class=(["'])title\9>[\s\S]*?<\/div>)?\s*<\/div>/gi

export function restorePlantUmlImageBlocks(html: string): string {
  if (!html.includes(PLANTUML_SOURCE_DATA_URI_PREFIX)) {
    return html
  }
  return html.replace(
    PLANTUML_IMAGE_BLOCK_PATTERN,
    (
      match,
      beforeClass,
      quote,
      className,
      afterClass,
      _contentQuote,
      _srcQuote,
      target,
      title = '',
    ) => {
      const diagram = decodePlantUmlDiagram(target)
      if (diagram === undefined) {
        return match
      }
      return `<div${beforeClass} class=${quote}${className}${quote}${afterClass}>\n<div class="content">\n${plantUmlDiagramToHtml(diagram)}\n</div>${title}\n</div>`
    },
  )
}

function hasPlantUmlDiagram(html: string): boolean {
  const classAttributePattern = /class=(['"])(.*?)\1/g
  for (const match of html.matchAll(classAttributePattern)) {
    if (match[2].split(/\s+/).includes('plantuml')) {
      return true
    }
  }
  return false
}

/**
 * Convert the PlantUML image-block placeholder into a renderable container and
 * inject the @plantuml/core browser renderer into exported HTML.
 */
export function addPlantUmlToHtmlExport(html: string): string {
  html = restorePlantUmlImageBlocks(html)
  if (!hasPlantUmlDiagram(html) || html.includes(PLANTUML_MODULE_CDN_URL)) {
    return html
  }
  const script = `\n${plantUmlExportScript()}\n`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${html}${script}`
}
