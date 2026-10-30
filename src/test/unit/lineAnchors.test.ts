import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { syncLineAnchors } from '../../../preview-src/line-anchors.js'

function fakeElement(className: string, nested: any[] = []) {
  const element: any = {
    className,
    getAttribute: () => element.className,
    setAttribute: (_name: string, value: string) => {
      element.className = value
    },
    querySelectorAll: () => nested,
  }
  return element
}

describe('syncLineAnchors', () => {
  test('moves the anchor of the block and keeps its other classes', () => {
    const from = fakeElement('listingblock data-line-3 data-h-abc rendered')
    syncLineAnchors(from, fakeElement('listingblock data-line-4 data-h-abc'))
    assert.equal(from.className, 'listingblock data-line-4 data-h-abc rendered')
  })

  test('moves the nested anchors', () => {
    const cell = fakeElement('tableblock data-line-7')
    const from = fakeElement('data-line-5 data-h-abc', [cell])
    const to = fakeElement('data-line-6 data-h-abc', [
      fakeElement('tableblock data-line-8'),
    ])
    syncLineAnchors(from, to)
    assert.equal(cell.className, 'tableblock data-line-8')
  })

  test('leaves the nested anchors when they do not match', () => {
    const cell = fakeElement('data-line-7')
    syncLineAnchors(
      fakeElement('data-line-5', [cell]),
      fakeElement('data-line-6', []),
    )
    assert.equal(cell.className, 'data-line-7')
  })

  test('does not add an anchor to an element without one', () => {
    const from = fakeElement('listingblock')
    syncLineAnchors(from, fakeElement('listingblock data-line-4'))
    assert.equal(from.className, 'listingblock')
  })
})
