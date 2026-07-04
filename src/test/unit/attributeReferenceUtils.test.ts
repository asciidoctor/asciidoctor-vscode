import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { load } from '@asciidoctor/core'
import { findNearestBlock } from '../../features/completion/attributeReferenceUtils.js'

const OPTIONS = { sourcemap: true }

describe('findNearestBlock', () => {
  test('returns undefined when document has no blocks', async () => {
    const doc = await load('', OPTIONS)
    assert.strictEqual(findNearestBlock(doc, 1), undefined)
  })

  test('returns block at exact line number', async () => {
    const doc = await load('First paragraph.', OPTIONS)
    const block = findNearestBlock(doc, 1)
    assert.ok(block)
    assert.strictEqual(block.getSourceLocation().getLineNumber(), 1)
  })

  test('returns nearest block before the given line', async () => {
    // line 1: paragraph, line 2: empty, line 3: paragraph
    const doc = await load('First paragraph.\n\nSecond paragraph.', OPTIONS)
    const block = findNearestBlock(doc, 2) // empty line between the two paragraphs
    assert.ok(block)
    assert.strictEqual(block.getSourceLocation().getLineNumber(), 1)
  })

  test('returns undefined when line is before any block', async () => {
    // line 1 and 2 are empty, paragraph starts at line 3
    const doc = await load('\n\nParagraph.', OPTIONS)
    assert.strictEqual(findNearestBlock(doc, 2), undefined)
  })

  test('returns the correct block among multiple blocks', async () => {
    // line 1: first paragraph, line 2: empty, line 3: second paragraph
    const doc = await load('First paragraph.\n\nSecond paragraph.', OPTIONS)
    const block = findNearestBlock(doc, 3)
    assert.ok(block)
    assert.strictEqual(block.getSourceLocation().getLineNumber(), 3)
  })

  test('returns a verbatim listing block at its delimiter line', async () => {
    // line 1: ---- (listing block delimiter), line 2: code, line 3: ----
    const doc = await load('----\ncode\n----', OPTIONS)
    const block = findNearestBlock(doc, 1)
    assert.ok(block)
    assert.strictEqual(block.getContext(), 'listing')
    assert.strictEqual(block.getContentModel(), 'verbatim')
  })

  test('returns the enclosing verbatim block for a line inside it', async () => {
    // line 1: ---- (listing block), line 2: code (inside), line 3: ----
    const doc = await load('----\ncode\n----', OPTIONS)
    const block = findNearestBlock(doc, 2)
    assert.ok(block)
    assert.strictEqual(block.getContext(), 'listing')
  })

  test('does not throw on a document containing a table', async () => {
    // A `table_cell` exposes a source location without `getLineNumber`; calling
    // it used to throw and, through the providers, silently killed attribute
    // completion and hover for any document with a table.
    const doc = await load('|===\n| A | B\n| C | D\n|===\n\nAfter.', OPTIONS)
    let onErrorCalls = 0
    const block = findNearestBlock(doc, 6, () => onErrorCalls++)
    assert.strictEqual(onErrorCalls, 0, 'no block should have thrown')
    assert.ok(block)
    assert.strictEqual(block.getContext(), 'paragraph')
  })
})
