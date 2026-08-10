import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { addMermaidToHtmlExport } from '../../features/asciidoctor/mermaidExport.js'

describe('addMermaidToHtmlExport', () => {
  test('adds Mermaid CDN and browser-side rendering script when Mermaid blocks are present', () => {
    const html = `<html>
<body>
<pre class='mermaid'>graph TD
  A --> B</pre>
</body>
</html>`

    const output = addMermaidToHtmlExport(html)

    assert.match(
      output,
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@11\.16\.0\/dist\/mermaid\.min\.js"><\/script>/,
    )
    assert.match(
      output,
      /mermaid\.initialize\(\{ startOnLoad: false \}\);\nmermaid\.run\(\{ querySelector: '\.mermaid' \}\);/,
    )
    assert.ok(
      output.indexOf('mermaid.min.js') < output.indexOf('</body>'),
      `expected Mermaid scripts before </body> in:\n${output}`,
    )
  })

  test('does not add Mermaid scripts when no Mermaid block is present', () => {
    const html = '<html><body><pre>plain listing</pre></body></html>'

    assert.strictEqual(addMermaidToHtmlExport(html), html)
  })

  test('does not treat partial class name matches as Mermaid blocks', () => {
    const html =
      '<html><body><pre class="not-mermaid">plain listing</pre></body></html>'

    assert.strictEqual(addMermaidToHtmlExport(html), html)
  })

  test('does not add duplicate Mermaid scripts', () => {
    const html = addMermaidToHtmlExport(
      "<html><body><pre class='mermaid'>graph TD; A-->B</pre></body></html>",
    )

    assert.strictEqual(addMermaidToHtmlExport(html), html)
  })

  test('appends Mermaid scripts when the exported fragment has no body element', () => {
    const html = '<section><pre class="mermaid">graph TD; A-->B</pre></section>'

    const output = addMermaidToHtmlExport(html)

    assert.ok(
      output.endsWith('</script>\n'),
      `expected Mermaid scripts appended to the fragment:\n${output}`,
    )
  })
})
