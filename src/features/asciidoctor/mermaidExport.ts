import {
  decodeMermaidSource,
  MERMAID_SOURCE_DATA_URI_PREFIX,
} from '../preview/mermaid.js'

const MERMAID_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js'

const MERMAID_EXPORT_SCRIPT = `<script src="${MERMAID_CDN_URL}"></script>
<script>
mermaid.initialize({ startOnLoad: false });
mermaid.run({ querySelector: '.mermaid' });
</script>`

const PRE_CLASS_PATTERN = /<pre\s+[^>]*class=(["'])([^"']*)\1/gi
const MERMAID_IMAGE_BLOCK_PATTERN =
  /<div([^>]*) class=(["'])([^"']*\bimageblock\b[^"']*\bmermaidblock\b[^"']*)\2([^>]*)>\s*<div class=(["'])content\5>\s*<img\b[^>]*\bsrc=(["'])(data:text\/vnd\.mermaid;base64,[^"']+)\6[^>]*>\s*<\/div>(\s*<div class=(["'])title\9>[\s\S]*?<\/div>)?\s*<\/div>/gi

function restoreMermaidImageBlocks(html: string): string {
  if (!html.includes(MERMAID_SOURCE_DATA_URI_PREFIX)) {
    return html
  }
  return html.replace(
    MERMAID_IMAGE_BLOCK_PATTERN,
    (
      _match,
      beforeClass,
      quote,
      className,
      afterClass,
      _contentQuote,
      _srcQuote,
      target,
      title = '',
    ) => {
      const source = decodeMermaidSource(target)
      if (source === undefined) {
        return _match
      }
      return `<div${beforeClass} class=${quote}${className}${quote}${afterClass}>\n<div class="content">\n<pre class='mermaid'>${source}</pre>\n</div>${title}\n</div>`
    },
  )
}

function hasMermaidBlock(html: string): boolean {
  for (const match of html.matchAll(PRE_CLASS_PATTERN)) {
    if (match[2].split(/\s+/).includes('mermaid')) {
      return true
    }
  }
  return false
}

export function addMermaidToHtmlExport(html: string): string {
  html = restoreMermaidImageBlocks(html)
  if (
    !hasMermaidBlock(html) ||
    html.includes(MERMAID_CDN_URL) ||
    html.includes('mermaid.run(')
  ) {
    return html
  }

  const script = `\n${MERMAID_EXPORT_SCRIPT}\n`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`)
  }
  return `${html}${script}`
}
