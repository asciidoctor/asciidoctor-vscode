import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseHeaderOnly } from '../../features/asciidoctor/headerParse.js'

describe('parseHeaderOnly', () => {
  test('reads the attributes of the header without parsing the body', async () => {
    const document = await parseHeaderOnly(
      '= Title\n:kroki-server-url: http://localhost:8000\n:data-uri:\n\n== Section\n\nA paragraph.\n',
    )
    assert.equal(
      document.getAttribute('kroki-server-url'),
      'http://localhost:8000',
    )
    assert.equal(document.isAttribute('data-uri'), true)
    assert.deepEqual(document.getBlocks(), [])
  })

  test('passes the other options through', async () => {
    const document = await parseHeaderOnly('= Title\n\nA paragraph.\n', {
      attributes: { 'kroki-server-url': 'http://kroki:9000' },
    })
    assert.equal(document.getAttribute('kroki-server-url'), 'http://kroki:9000')
    assert.deepEqual(document.getBlocks(), [])
  })
})
