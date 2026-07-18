import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { convert, Extensions } from '@asciidoctor/core'
import { mermaidJSProcessor } from '../../features/preview/mermaid.js'

async function convertWithMermaid(input: string): Promise<string> {
  const registry = Extensions.create()
  registry.block('mermaid', mermaidJSProcessor())
  const output = await convert(input, {
    extension_registry: registry,
    safe: 'safe',
  })
  return String(output)
}

describe('mermaidJSProcessor', () => {
  test('wraps a [mermaid] listing block in a <pre class="mermaid"> element', async () => {
    const html = await convertWithMermaid(
      '[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(html, /<pre class='mermaid'>graph TD\n {2}A --> B<\/pre>/)
  })

  test('handles a [mermaid] literal block (delimited with dots)', async () => {
    const html = await convertWithMermaid(
      '[mermaid]\n....\nsequenceDiagram\n  Alice->>Bob: Hi\n....',
    )
    assert.match(
      html,
      /<pre class='mermaid'>sequenceDiagram\n {2}Alice->>Bob: Hi<\/pre>/,
    )
  })

  test('preserves the diagram source verbatim, without HTML-escaping it', async () => {
    const html = await convertWithMermaid('[mermaid]\n----\nA-->B & C\n----')
    assert.ok(
      html.includes("<pre class='mermaid'>A-->B & C</pre>"),
      `expected raw diagram text, got: ${html}`,
    )
  })

  test('does not touch listing blocks that are not mermaid', async () => {
    const html = await convertWithMermaid('----\nplain listing\n----')
    assert.doesNotMatch(html, /class='mermaid'/)
    assert.match(html, /plain listing/)
  })
})

test('renders Mermaid blocks to embedded SVG for exported HTML', async () => {
  const { renderMermaidDiagramsInHtml } = await import(
    '../../features/preview/mermaidExport.js'
  )
  const html = await renderMermaidDiagramsInHtml(
    '<html><body><pre class="mermaid">flowchart TD\nA-->B</pre></body></html>',
  )
  assert.match(html, /<div class="mermaid"><svg/)
  assert.doesNotMatch(html, /<pre class="mermaid">/)
})
