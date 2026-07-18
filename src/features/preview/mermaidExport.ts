const MERMAID_BLOCK_RX = /<pre\b[^>]*\bclass=(["'])[^"']*\bmermaid\b/i

function escapeScriptContent(script: string): string {
  return script.replace(/<\/script/gi, '<\\/script')
}

export function hasMermaidBlocks(html: string): boolean {
  return MERMAID_BLOCK_RX.test(html)
}

export function renderMermaidExportScript(script: string): string {
  return `<script>
${escapeScriptContent(script)}
;(async () => {
  const mermaid = globalThis.mermaid
  if (!mermaid) {
    return
  }
  const dark =
    globalThis.matchMedia &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' })
  try {
    await mermaid.run()
  } catch (e) {
    console.error('Mermaid rendering failed', e)
  }
})()
</script>`
}

export function injectMermaidExportScript(
  html: string,
  script: string,
): string {
  if (!hasMermaidBlocks(html)) {
    return html
  }
  const markup = renderMermaidExportScript(script)
  if (html.includes('</body>')) {
    return html.replace('</body>', () => `${markup}\n</body>`)
  }
  return `${html}\n${markup}`
}
