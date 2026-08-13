import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { convert, Extensions } from '@asciidoctor/core'
import {
  encodeMermaidSource,
  MERMAID_SOURCE_DATA_URI_PREFIX,
  mermaidJSProcessor,
} from '../../features/preview/mermaid.js'

// The preview decodes the data URI client-side (see generateMermaid() in
// asciidoctorWebViewConverter.ts), so tests decode it themselves here to
// verify what encodeMermaidSource actually produces.
function decodeMermaidSource(target: string): string {
  assert.ok(target.startsWith(MERMAID_SOURCE_DATA_URI_PREFIX))
  return Buffer.from(
    target.slice(MERMAID_SOURCE_DATA_URI_PREFIX.length),
    'base64',
  ).toString('utf8')
}

async function convertWithMermaid(input: string): Promise<string> {
  const registry = Extensions.create()
  registry.block('mermaid', mermaidJSProcessor())
  const output = await convert(input, {
    extension_registry: registry,
    safe: 'safe',
  })
  return String(output)
}

async function convertWithMermaidAndCaptionRewrite(
  input: string,
): Promise<string> {
  const registry = Extensions.create()
  registry.block('mermaid', mermaidJSProcessor())
  ;(registry as any).treeProcessor(function (this: any) {
    this.process(function (document: any) {
      document
        .findBy(
          (node: any) =>
            node.getContext?.() === 'image' && node.hasRole?.('mermaidblock'),
        )
        .forEach((block: any) => block.setCaption('Diagram 7. '))
      return document
    })
  })
  return String(
    await convert(input, { extension_registry: registry, safe: 'safe' }),
  )
}

describe('encodeMermaidSource', () => {
  test('encodes the diagram source as a base64 data URI', () => {
    const encoded = encodeMermaidSource('graph TD\n  A --> B')
    assert.match(encoded, /^data:text\/vnd\.mermaid;base64,/)
    assert.strictEqual(decodeMermaidSource(encoded), 'graph TD\n  A --> B')
  })

  test('round-trips characters that are meaningful in HTML, without escaping them', () => {
    const source = 'A-->B & C <D>'
    assert.strictEqual(decodeMermaidSource(encodeMermaidSource(source)), source)
  })
})

describe('mermaidJSProcessor', () => {
  test('models a [mermaid] listing block as an image block carrying the diagram as a data URI', async () => {
    const html = await convertWithMermaid(
      '[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(html, /<div class="imageblock mermaidblock">/)
    const match = html.match(/<img src="(data:text\/vnd\.mermaid;[^"]+)"/)
    assert.ok(match, `expected a Mermaid data URI <img> in: ${html}`)
    assert.strictEqual(decodeMermaidSource(match![1]), 'graph TD\n  A --> B')
  })

  test('handles a [mermaid] literal block (delimited with dots)', async () => {
    const html = await convertWithMermaid(
      '[mermaid]\n....\nsequenceDiagram\n  Alice->>Bob: Hi\n....',
    )
    const match = html.match(/<img src="(data:text\/vnd\.mermaid;[^"]+)"/)
    assert.ok(match, `expected a Mermaid data URI <img> in: ${html}`)
    assert.strictEqual(
      decodeMermaidSource(match![1]),
      'sequenceDiagram\n  Alice->>Bob: Hi',
    )
  })

  test('renders a block title as a figure title like Kroki image blocks', async () => {
    const html = await convertWithMermaid(
      '.My *Diagram*\n[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(
      html,
      /<div class="title">Figure 1\. My <strong>Diagram<\/strong><\/div>/,
    )
  })

  test('lets tree processors rewrite the caption like a Kroki image block', async () => {
    const html = await convertWithMermaidAndCaptionRewrite(
      '.My Diagram\n[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(html, /<div class="title">Diagram 7\. My Diagram<\/div>/)
    assert.doesNotMatch(html, /Figure 1\. My Diagram/)
  })

  test('honors figure caption settings for titled Mermaid blocks', async () => {
    const html = await convertWithMermaid(
      ':figure-caption!:\n\n.My Diagram\n[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(html, /<div class="title">My Diagram<\/div>/)
    assert.doesNotMatch(html, /Figure 1\./)
  })

  test('places block id and roles on the imageblock wrapper', async () => {
    const html = await convertWithMermaid(
      '[#diagram.overview]\n[mermaid]\n----\ngraph TD\n  A --> B\n----',
    )
    assert.match(
      html,
      /<div id="diagram" class="imageblock mermaidblock overview">/,
    )
  })

  test('does not touch listing blocks that are not mermaid', async () => {
    const html = await convertWithMermaid('----\nplain listing\n----')
    assert.doesNotMatch(html, /mermaidblock/)
    assert.match(html, /plain listing/)
  })
})
