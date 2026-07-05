import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  anchorIndicesForLine,
  type LineTop,
  scrollTopForLine,
  sourceLineAtViewportTop,
} from '../../features/preview/scrollMapping.js'

// These tests pin down the one convention behind the preview's scroll sync:
//   - VS Code editor lines are 0-based.
//   - Preview anchors (`data-line-N`) are 1-based source lines.
// so editor line `L` maps to anchor `data-line-(L+1)`. Getting that +1 wrong (or
// applying it twice) is what makes the preview jump on edit/refocus.

describe('anchorIndicesForLine — 0-based editor line vs 1-based source line', () => {
  const lines = [1, 42, 43, 50]

  test('an editor line (0-based) matches the anchor one further down (+1)', () => {
    // Editor line 42 is the 43rd line → source line / data-line 43 (index 2).
    assert.deepEqual(anchorIndicesForLine(lines, 42, false), {
      previous: 2,
      next: -1,
    })
  })

  test('a source line (1-based) is matched as-is (no +1)', () => {
    // Source line 42 → data-line 42 (index 1).
    assert.deepEqual(anchorIndicesForLine(lines, 42, true), {
      previous: 1,
      next: -1,
    })
  })

  test('a target between two anchors returns both neighbours', () => {
    // Source line 44 sits between data-line 43 (index 2) and 50 (index 3).
    assert.deepEqual(anchorIndicesForLine(lines, 44, true), {
      previous: 2,
      next: 3,
    })
  })

  test('a target below the first anchor keeps previous at index 0', () => {
    assert.deepEqual(anchorIndicesForLine([10, 20, 30], 5, true), {
      previous: 0,
      next: 0,
    })
  })

  test('no anchors → previous 0, no next', () => {
    assert.deepEqual(anchorIndicesForLine([], 5, true), {
      previous: 0,
      next: -1,
    })
  })
})

describe('sourceLineAtViewportTop — pixel offset → 1-based source line', () => {
  test('returns null when there are no anchors', () => {
    assert.equal(sourceLineAtViewportTop([], 0), null)
  })

  test('clamps to the first anchor when the viewport top is above it', () => {
    const anchors: LineTop[] = [{ line: 5, top: 100 }]
    assert.equal(sourceLineAtViewportTop(anchors, 0), 5)
  })

  test('interpolates linearly between two anchors', () => {
    const anchors: LineTop[] = [
      { line: 10, top: 0 },
      { line: 20, top: 100 },
    ]
    // Halfway down the pixels between the anchors → halfway between the lines.
    assert.equal(sourceLineAtViewportTop(anchors, 50), 15)
  })
})

describe('scrollTopForLine — 1-based source line ↔ pixel offset round-trip', () => {
  // Preview scrolled so `data-line-42` sits exactly at the viewport top; the
  // current page scroll is 876px.
  const anchors: LineTop[] = [
    { line: 1, top: -800 },
    { line: 42, top: 0 },
    { line: 43, top: 70 },
    { line: 50, top: 500 },
  ]
  const scrollY = 876

  test('the source line at the viewport top round-trips to the same scrollY', () => {
    // This is exactly what a content morph does: read the top source line, then
    // re-pin to it. With `sourceLine: true` the pixel offset comes back to where
    // we already are — no jump.
    const topLine = sourceLineAtViewportTop(anchors, 0)
    assert.equal(topLine, 42)
    assert.equal(
      scrollTopForLine(anchors, scrollY, topLine as number, true),
      876,
    )
  })

  test('mis-treating that source line as an editor line jumps by one anchor (the bug)', () => {
    // The +1 for editor lines targets `data-line-43` instead of 42, so the
    // re-pin lands 70px lower — the one-source-line jump seen on edit.
    assert.equal(scrollTopForLine(anchors, scrollY, 42, false), 946)
  })

  test('an editor line resolves to the anchor one further down', () => {
    const simple: LineTop[] = [
      { line: 10, top: 0 },
      { line: 20, top: 100 },
    ]
    // Editor line 9 → data-line 10 (top 0) → scrollTo === current scrollY.
    assert.equal(scrollTopForLine(simple, 200, 9, false), 200)
  })

  test('returns undefined when there are no anchors', () => {
    assert.equal(scrollTopForLine([], 0, 5, true), undefined)
  })
})
