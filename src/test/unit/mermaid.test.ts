import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { convert, Extensions } from '@asciidoctor/core'
import {
  hasMermaidBlocks,
  injectMermaidExportScript,
} from '../../features/preview/mermaidExport.js'
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

describe('Mermaid export HTML support', () => {
  test('detects Mermaid blocks rendered by the block processor', () => {
    assert.equal(hasMermaidBlocks("<pre class='mermaid'>graph TD</pre>"), true)
    assert.equal(
      hasMermaidBlocks('<pre class="diagram mermaid">graph TD</pre>'),
      true,
    )
    assert.equal(hasMermaidBlocks('<pre class="listing">graph TD</pre>'), false)
  })

  test('injects the bundled Mermaid script before the body closes', () => {
    const html = "<html><body><pre class='mermaid'>graph TD</pre></body></html>"
    const result = injectMermaidExportScript(
      html,
      "console.log('</script> safe'); const replacement = '$&'",
    )
    assert.match(result, /<script>/)
    assert.ok(result.includes('<\\/script> safe'))
    assert.ok(result.includes("const replacement = '$&'"))
    assert.match(result, /mermaid\.initialize/)
    assert.match(result, /await mermaid\.run/)
    assert.match(result, /<\/script>\n<\/body>/)
  })

  test('leaves exported HTML without Mermaid untouched', () => {
    const html = '<html><body><p>plain</p></body></html>'
    assert.equal(injectMermaidExportScript(html, 'console.log(1)'), html)
  })
})
