import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { convert, Extensions } from '@asciidoctor/core'
import { addMermaidToHtmlExport } from '../../features/asciidoctor/mermaidExport.js'
import { mermaidJSProcessor } from '../../features/preview/mermaid.js'

const MERMAID_CDN_URL =
  'https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs'

describe('addMermaidToHtmlExport', () => {
  test('does nothing when the HTML has no Mermaid block', () => {
    const html = '<html><body><p>Some content</p></body></html>'
    assert.strictEqual(addMermaidToHtmlExport(html), html)
  })

  test('injects the Mermaid CDN script before </body> when a Mermaid image block is present', () => {
    const html =
      '<html><body><div class="imageblock mermaidblock"><div class="content"><img src="data:text/vnd.mermaid;base64,Zm9v" alt="Mermaid diagram"></div></div></body></html>'
    const output = addMermaidToHtmlExport(html)
    assert.match(output, new RegExp(`import mermaid from '${MERMAID_CDN_URL}'`))
    assert.ok(
      output.indexOf('<script') < output.indexOf('</body>'),
      `expected the script before </body> in: ${output}`,
    )
  })

  test('appends the script at the end when there is no </body>', () => {
    const html =
      '<div class="imageblock mermaidblock"><div class="content"><img src="data:text/vnd.mermaid;base64,Zm9v" alt="Mermaid diagram"></div></div>'
    const output = addMermaidToHtmlExport(html)
    assert.ok(output.startsWith(html))
    assert.match(output, new RegExp(`import mermaid from '${MERMAID_CDN_URL}'`))
  })

  test('is idempotent: does not inject the script twice', () => {
    const html =
      '<html><body><div class="imageblock mermaidblock"><div class="content"><img src="data:text/vnd.mermaid;base64,Zm9v" alt="Mermaid diagram"></div></div></body></html>'
    const once = addMermaidToHtmlExport(html)
    const twice = addMermaidToHtmlExport(once)
    assert.strictEqual(twice, once)
  })

  test('injects the script for a real [mermaid] block converted with the default converter', async () => {
    const registry = Extensions.create()
    registry.block('mermaid', mermaidJSProcessor())
    const html = String(
      await convert('[mermaid]\n----\ngraph TD\n  A --> B\n----', {
        extension_registry: registry,
        safe: 'safe',
        header_footer: true,
      }),
    )
    const output = addMermaidToHtmlExport(html)
    assert.match(output, new RegExp(`import mermaid from '${MERMAID_CDN_URL}'`))
    assert.match(output, /renderMermaidImages\(\[document\.body\]\);/)
  })
})
