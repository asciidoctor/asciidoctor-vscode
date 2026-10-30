import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { deferImageUpdate } from '../../../preview-src/deferred-image.js'

type FakeImage = HTMLImageElement & {
  attrs: Record<string, string>
  replacedBy?: FakeImage
  resolveDecode: () => void
  rejectDecode: () => void
}

function fakeImage(attrs: Record<string, string>, naturalWidth = 300) {
  const image: any = {
    attrs,
    complete: true,
    isConnected: true,
    naturalWidth,
    style: {},
    getAttribute: (name: string) => attrs[name] ?? null,
    isEqualNode: (other: FakeImage) =>
      JSON.stringify(attrs) === JSON.stringify(other.attrs),
    replaceWith: (next: FakeImage) => {
      image.replacedBy = next
    },
    decode: () =>
      new Promise<void>((resolve, reject) => {
        image.resolveDecode = resolve
        image.rejectDecode = reject
      }),
  }
  return image as FakeImage
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('deferImageUpdate', () => {
  const options = {
    keepViewport: (mutate: () => void) => mutate(),
    staleTitle: () => 'stale',
  }
  let imported: FakeImage[]

  beforeEach(() => {
    imported = []
    ;(globalThis as any).document = {
      importNode: (node: FakeImage) => {
        const copy = fakeImage(node.attrs)
        imported.push(copy)
        return copy
      },
    }
  })

  afterEach(() => {
    delete (globalThis as any).document
  })

  test('keeps the current image until the new one is ready', async () => {
    const from = fakeImage({ src: 'a.svg' })
    assert.equal(
      deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options),
      true,
    )
    await flush()
    assert.equal(from.replacedBy, undefined)

    imported[0].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, imported[0])
  })

  test('swaps the image through keepViewport', async () => {
    const from = fakeImage({ src: 'a.svg' })
    let replacedInside = false
    deferImageUpdate(from, fakeImage({ src: 'b.svg' }), {
      ...options,
      keepViewport: (mutate) => {
        mutate()
        replacedInside = from.replacedBy !== undefined
      },
    })
    imported[0].resolveDecode()
    await flush()
    assert.equal(replacedInside, true)
  })

  test('only displays the latest version', async () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options)
    deferImageUpdate(from, fakeImage({ src: 'c.svg' }), options)

    imported[0].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, undefined)

    imported[1].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, imported[1])
  })

  test('does not load the same version twice', () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options)
    assert.equal(
      deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options),
      true,
    )
    assert.equal(imported.length, 1)
  })

  test('cancels the pending version when the source goes back', async () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options)
    assert.equal(
      deferImageUpdate(from, fakeImage({ src: 'a.svg' }), options),
      false,
    )
    imported[0].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, undefined)
  })

  test('keeps a displayed image dimmed when the new one fails', async () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'broken.svg' }), options)
    imported[0].rejectDecode()
    await flush()
    assert.equal(from.replacedBy, undefined)
    assert.equal(from.style.opacity, '0.5')
    assert.equal(from.title, 'stale')

    // An edit elsewhere in the document does not request the broken one again.
    deferImageUpdate(from, fakeImage({ src: 'broken.svg' }), options)
    assert.equal(imported.length, 1)
  })

  test('shows the broken image when no image is displayed', async () => {
    const from = fakeImage({ src: 'a.svg' }, 0)
    deferImageUpdate(from, fakeImage({ src: 'broken.svg' }), options)
    imported[0].rejectDecode()
    await flush()
    assert.equal(from.replacedBy, imported[0])
  })

  test('recovers from a failure when a new version loads', async () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'broken.svg' }), options)
    imported[0].rejectDecode()
    await flush()
    deferImageUpdate(from, fakeImage({ src: 'c.svg' }), options)
    imported[1].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, imported[1])
  })

  test('leaves the update to the morph when there is nothing to wait for', () => {
    const from = fakeImage({ src: 'a.svg' })
    for (const attrs of [
      { src: 'a.svg', alt: 'changed' },
      { src: 'data:image/svg+xml;base64,AAAA' },
      { src: 'b.svg', loading: 'lazy' },
      {},
    ] as Record<string, string>[]) {
      assert.equal(deferImageUpdate(from, fakeImage(attrs), options), false)
    }
    assert.equal(imported.length, 0)
  })

  test('ignores an image removed from the document in the meantime', async () => {
    const from = fakeImage({ src: 'a.svg' })
    deferImageUpdate(from, fakeImage({ src: 'b.svg' }), options)
    ;(from as any).isConnected = false
    imported[0].resolveDecode()
    await flush()
    assert.equal(from.replacedBy, undefined)
  })
})
