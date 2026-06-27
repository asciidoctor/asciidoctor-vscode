import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  isFromMainDocument,
  resolveBlockSourceLines,
} from '../../features/asciidoctor/sourceLineMapping.js'

describe('resolveBlockSourceLines', () => {
  test('keeps line numbers unchanged when there is no include', () => {
    const blocks = [
      { lineNumber: 1, file: 'main.adoc' },
      { lineNumber: 3, file: 'main.adoc' },
      { lineNumber: 7, file: 'main.adoc' },
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, 'main.adoc'),
      [1, 3, 7],
    )
  })

  test('anchors included blocks to the preceding main-document line', () => {
    // The first block of an included file reports line 1 relative to that file;
    // it must not be emitted verbatim because it would break the ascending order.
    const blocks = [
      { lineNumber: 1, file: 'main.adoc' }, // document
      { lineNumber: 3, file: 'main.adoc' }, // paragraph before the include
      { lineNumber: 1, file: 'inc.adoc' }, // first included paragraph
      { lineNumber: 3, file: 'inc.adoc' }, // second included paragraph
      { lineNumber: 7, file: 'main.adoc' }, // paragraph after the include
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, 'main.adoc'),
      [1, 3, 3, 3, 7],
    )
  })

  test('keeps the resolved lines monotonically increasing', () => {
    const blocks = [
      { lineNumber: 1, file: 'main.adoc' },
      { lineNumber: 5, file: 'main.adoc' },
      { lineNumber: 1, file: 'a.adoc' },
      { lineNumber: 12, file: 'b.adoc' },
      { lineNumber: 9, file: 'main.adoc' },
    ]
    const lines = resolveBlockSourceLines(blocks, 'main.adoc')
    assert.deepStrictEqual(lines, [1, 5, 5, 5, 9])
    for (let i = 1; i < lines.length; i++) {
      assert.ok(lines[i] >= lines[i - 1], 'lines must not decrease')
    }
  })

  test('handles nested/consecutive includes before any main content', () => {
    const blocks = [
      { lineNumber: 1, file: 'main.adoc' }, // document
      { lineNumber: 1, file: 'inc.adoc' },
      { lineNumber: 2, file: 'nested.adoc' },
      { lineNumber: 3, file: 'main.adoc' },
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, 'main.adoc'),
      [1, 1, 1, 3],
    )
  })

  test('anchors fileless blocks (e.g. table cells) inside an include to the include line', () => {
    // A table inside an included file: the table block carries the include file,
    // but its cells report a line within the partial with NO file. They must not
    // be mistaken for main-document lines.
    const blocks = [
      { lineNumber: 5, file: 'main.adoc' }, // paragraph before the include
      { lineNumber: 40, file: 'inc.adoc' }, // table (from the include)
      { lineNumber: 41 }, // table cell, no file
      { lineNumber: 43 }, // table cell, no file
      { lineNumber: 9, file: 'main.adoc' }, // paragraph after the include
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, 'main.adoc'),
      [5, 5, 5, 5, 9],
    )
  })

  test('clamps out-of-order main-document lines so the sequence never decreases', () => {
    // Even when every block belongs to the main document, the output is clamped
    // to a running maximum to defend against sourcemap quirks.
    const blocks = [
      { lineNumber: 1, file: 'main.adoc' },
      { lineNumber: 8, file: 'main.adoc' },
      { lineNumber: 4, file: 'main.adoc' },
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, 'main.adoc'),
      [1, 8, 8],
    )
  })

  test('keeps the sequence non-decreasing even when the main file is unknown', () => {
    // Without a reference file (e.g. an unsaved document) includes cannot be
    // detected, but the running-maximum clamp still prevents a low include line
    // from poisoning the ordering.
    const blocks = [
      { lineNumber: 1 },
      { lineNumber: 4 },
      { lineNumber: 1, file: 'inc.adoc' },
    ]
    assert.deepStrictEqual(
      resolveBlockSourceLines(blocks, undefined),
      [1, 4, 4],
    )
  })

  test('returns an empty array for no blocks', () => {
    assert.deepStrictEqual(resolveBlockSourceLines([], 'main.adoc'), [])
  })
})

describe('isFromMainDocument', () => {
  test('matches the main file', () => {
    assert.equal(isFromMainDocument({ lineNumber: 1, file: 'a' }, 'a'), true)
  })

  test('does not match a different file', () => {
    assert.equal(isFromMainDocument({ lineNumber: 1, file: 'b' }, 'a'), false)
  })

  test('treats a fileless block as included when the main file is known', () => {
    assert.equal(isFromMainDocument({ lineNumber: 1 }, 'a'), false)
  })

  test('treats every block as main when the main file is unknown', () => {
    assert.equal(
      isFromMainDocument({ lineNumber: 1, file: 'b' }, undefined),
      true,
    )
  })
})
