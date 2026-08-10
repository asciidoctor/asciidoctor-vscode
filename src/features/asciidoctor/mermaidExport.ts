const MERMAID_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js'

const MERMAID_EXPORT_SCRIPT = `<script src="${MERMAID_CDN_URL}"></script>
<script>
mermaid.initialize({ startOnLoad: false });
mermaid.run({ querySelector: '.mermaid' });
</script>`

const PRE_CLASS_PATTERN = /<pre\s+[^>]*class=(["'])([^"']*)\1/gi

function hasMermaidBlock(html: string): boolean {
  for (const match of html.matchAll(PRE_CLASS_PATTERN)) {
    if (match[2].split(/\s+/).includes('mermaid')) {
      return true
    }
  }
  return false
}

export function addMermaidToHtmlExport(html: string): string {
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
