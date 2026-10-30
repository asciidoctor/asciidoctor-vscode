import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { Extensions, load } from '@asciidoctor/core'
import { hashBlockSource } from '../../features/asciidoctor/blockSignature.js'
import { mermaidJSProcessor } from '../../features/preview/mermaid.js'

async function hashOfImage(input: string): Promise<string | undefined> {
  const registry = Extensions.create()
  registry.block('mermaid', mermaidJSProcessor())
  const document = await load(input, {
    extension_registry: registry,
    safe: 'safe',
  })
  const [block] = (document as any).findBy(
    (node: any) => node.getContext() === 'image',
  )
  return hashBlockSource(block)
}

const diagram = '[mermaid]\n----\ngraph TD;\n----'

describe('hashBlockSource', () => {
  test('hashes a diagram modeled as an image block', async () => {
    assert.ok(await hashOfImage(diagram))
  })

  test('is stable when the diagram does not change', async () => {
    assert.equal(
      await hashOfImage(diagram),
      await hashOfImage(`Text before.\n\n${diagram}`),
    )
  })

  test('changes with the source of the diagram', async () => {
    assert.notEqual(
      await hashOfImage(diagram),
      await hashOfImage('[mermaid]\n----\ngraph LR;\n----'),
    )
  })

  test('changes with the title, the caption number, the link and the size', async () => {
    const reference = await hashOfImage(`.Title\n${diagram}`)
    for (const input of [
      `.Other\n${diagram}`,
      `.First\n[mermaid]\n----\ngraph LR;\n----\n\n.Title\n${diagram}`,
      `.Title\n[mermaid,link=https://example.org]\n----\ngraph TD;\n----`,
      `.Title\n[mermaid,width=200]\n----\ngraph TD;\n----`,
    ]) {
      assert.notEqual(await hashOfImage(input), reference, input)
    }
  })

  test('leaves a regular image without a signature', async () => {
    assert.equal(await hashOfImage('image::diagram.png[]'), undefined)
  })
})
