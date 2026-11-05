import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ActiveLineMarker } from '../../../preview-src/activeLineMarker.js'

function fakeElement(className = '') {
  const classes = new Set(className.split(' ').filter(Boolean))
  const element: any = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
      contains: (name: string) => classes.has(name),
    },
    // Replace the classes the way morphdom does with the freshly rendered HTML.
    morph: (newClassName: string) => {
      classes.clear()
      newClassName
        .split(' ')
        .filter(Boolean)
        .forEach((name) => classes.add(name))
    },
    isActive: () => classes.has('code-active-line'),
  }
  return element
}

describe('ActiveLineMarker', () => {
  test('highlights the block of the cursor', () => {
    const first = fakeElement('paragraph')
    const second = fakeElement('paragraph')
    const marker = new ActiveLineMarker((line) => (line < 5 ? first : second))
    marker.onDidChangeTextEditorSelection(2)
    assert.equal(first.isActive(), true)
    marker.onDidChangeTextEditorSelection(7)
    assert.equal(first.isActive(), false)
    assert.equal(second.isActive(), true)
  })

  test('highlights the block of the cursor again after a content update', () => {
    const block = fakeElement('paragraph')
    const marker = new ActiveLineMarker(() => block)
    marker.onDidChangeTextEditorSelection(3)
    marker.clear()
    assert.equal(block.isActive(), false)
    block.morph('paragraph data-line-4')
    marker.refresh()
    assert.equal(block.isActive(), true)
  })

  test('follows the block of the cursor when the update moves it', () => {
    const before = fakeElement('paragraph')
    const after = fakeElement('paragraph')
    let elements = new Map([[3, before]])
    const marker = new ActiveLineMarker((line) => elements.get(line))
    marker.onDidChangeTextEditorSelection(3)
    marker.clear()
    elements = new Map([[3, after]])
    marker.refresh()
    assert.equal(before.isActive(), false)
    assert.equal(after.isActive(), true)
  })

  test('does nothing on refresh before the first selection', () => {
    const block = fakeElement('paragraph')
    const marker = new ActiveLineMarker(() => block)
    marker.refresh()
    assert.equal(block.isActive(), false)
  })
})
