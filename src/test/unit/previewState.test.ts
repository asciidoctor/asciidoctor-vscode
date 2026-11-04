import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getInitialPreviewState } from '../../../preview-src/state.js'

const settings = { source: 'file:///a.adoc', line: 3, lineCount: 100 }

describe('getInitialPreviewState', () => {
  test('restores the persisted state of the same document', () => {
    const state = getInitialPreviewState(
      settings,
      { source: 'file:///a.adoc', line: 42, scrollY: 1200 },
      {},
    )
    assert.equal(state.line, 42)
    assert.equal(state.scrollY, 1200)
  })

  test('ignores the persisted state of another document', () => {
    const state = getInitialPreviewState(
      settings,
      { source: 'file:///b.adoc', line: 42, scrollX: 10, scrollY: 1200 },
      {},
    )
    assert.equal(state.source, 'file:///a.adoc')
    assert.equal(state.line, 3)
    assert.equal(state.scrollX, undefined)
    assert.equal(state.scrollY, undefined)
  })

  test('ignores a missing or invalid persisted state', () => {
    for (const persistedState of [undefined, null, 'state', 42]) {
      assert.deepEqual(getInitialPreviewState(settings, persistedState, {}), {
        ...settings,
      })
    }
  })

  test('applies the data state on top of the persisted state', () => {
    const state = getInitialPreviewState(
      settings,
      { source: 'file:///a.adoc', imageInfo: [{ id: 'old' }] },
      { imageInfo: [{ id: 'new' }] },
    )
    assert.deepEqual(state.imageInfo, [{ id: 'new' }])
  })
})
