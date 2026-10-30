import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import {
  holdViewport,
  previewEnvironment,
  type ViewportHoldEnvironment,
} from '../../../preview-src/viewport-hold.js'
import {
  encodeMermaidSource,
  MERMAID_ERROR_ATTRIBUTE,
  mermaidClientRenderScript,
} from '../../features/preview/mermaid.js'
import { PLANTUML_SOURCE_DATA_URI_PREFIX } from '../../features/preview/plantuml.js'

function fakeEnvironment(loading = false) {
  const state = {
    loading,
    layoutListener: undefined as (() => void) | undefined,
    inputListener: undefined as (() => void) | undefined,
  }
  const environment: ViewportHoldEnvironment = {
    isLoading: () => state.loading,
    onLayoutChange(listener) {
      state.layoutListener = listener
      return () => {
        state.layoutListener = undefined
      }
    },
    onUserInput(listener) {
      state.inputListener = listener
      return () => {
        state.inputListener = undefined
      }
    },
  }
  return { state, environment }
}

describe('holdViewport', () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  test('should position the viewport right away', () => {
    const { environment } = fakeEnvironment()
    const reposition = mock.fn()

    holdViewport(reposition, environment, mock.fn())

    assert.equal(reposition.mock.callCount(), 1)
  })

  test('should reposition the viewport on each layout change', () => {
    const { state, environment } = fakeEnvironment(true)
    const reposition = mock.fn()

    holdViewport(reposition, environment, mock.fn())
    state.layoutListener?.()
    state.layoutListener?.()

    assert.equal(reposition.mock.callCount(), 3)
  })

  test('should release once the page is loaded and the layout is quiet', () => {
    const { state, environment } = fakeEnvironment()
    const onRelease = mock.fn()

    holdViewport(mock.fn(), environment, onRelease)
    mock.timers.tick(499)
    assert.equal(onRelease.mock.callCount(), 0)
    mock.timers.tick(1)

    assert.deepEqual(onRelease.mock.calls[0].arguments, [false])
    assert.equal(state.layoutListener, undefined)
    assert.equal(state.inputListener, undefined)
  })

  test('should not release while the layout keeps changing', () => {
    const { state, environment } = fakeEnvironment()
    const onRelease = mock.fn()

    holdViewport(mock.fn(), environment, onRelease)
    mock.timers.tick(400)
    state.layoutListener?.()
    mock.timers.tick(400)
    assert.equal(onRelease.mock.callCount(), 0)
    mock.timers.tick(100)

    assert.equal(onRelease.mock.callCount(), 1)
  })

  test('should not release while the page is loading', () => {
    const { state, environment } = fakeEnvironment(true)
    const onRelease = mock.fn()

    holdViewport(mock.fn(), environment, onRelease)
    mock.timers.tick(5000)
    assert.equal(onRelease.mock.callCount(), 0)
    state.loading = false
    mock.timers.tick(500)

    assert.equal(onRelease.mock.callCount(), 1)
  })

  test('should release when the page never finishes loading', () => {
    const { environment } = fakeEnvironment(true)
    const onRelease = mock.fn()

    holdViewport(mock.fn(), environment, onRelease)
    mock.timers.tick(30000)

    assert.deepEqual(onRelease.mock.calls[0].arguments, [false])
  })

  test('should release right away on user input and stop repositioning', () => {
    const { state, environment } = fakeEnvironment(true)
    const reposition = mock.fn()
    const onRelease = mock.fn()

    holdViewport(reposition, environment, onRelease)
    state.inputListener?.()
    mock.timers.tick(30000)

    assert.equal(onRelease.mock.callCount(), 1)
    assert.deepEqual(onRelease.mock.calls[0].arguments, [true])
    assert.equal(state.layoutListener, undefined)
    assert.equal(reposition.mock.callCount(), 1)
  })

  test('should follow the new target after a retarget', () => {
    const { state, environment } = fakeEnvironment(true)
    const initial = mock.fn()
    const next = mock.fn()

    const hold = holdViewport(initial, environment, mock.fn())
    hold.retarget(next)
    state.layoutListener?.()

    assert.equal(initial.mock.callCount(), 1)
    assert.equal(next.mock.callCount(), 2)
  })

  test('should ignore a retarget after the release', () => {
    const { environment } = fakeEnvironment()
    const next = mock.fn()

    const hold = holdViewport(mock.fn(), environment, mock.fn())
    mock.timers.tick(500)
    hold.retarget(next)

    assert.equal(next.mock.callCount(), 0)
  })
})

describe('previewEnvironment', () => {
  const originalDocument = (globalThis as any).document

  // A Mermaid source image, along with the document that contains it.
  function fakeMermaidPage() {
    const attributes = new Map([
      ['src', encodeMermaidSource('graph TD\n  A --> B')],
    ])
    const image = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
      hasAttribute: (name: string) => attributes.has(name),
      replaceWith: () => images.splice(images.indexOf(image), 1),
      matches: () => true,
    }
    const images = [image]
    ;(globalThis as any).document = {
      readyState: 'complete',
      createElement: () => ({}),
      querySelectorAll: () => images,
    }
    return image
  }

  // Run the script that the preview really inlines, with the given `mermaid`.
  async function renderMermaid(image: unknown, render: () => Promise<unknown>) {
    const renderMermaidImages = new Function(
      'mermaid',
      `${mermaidClientRenderScript()}; return renderMermaidImages;`,
    )({ render })
    await renderMermaidImages([image])
  }

  beforeEach(() => {
    mock.method(console, 'error', () => {
      // The render failures are expected: keep them out of the test output.
    })
  })

  afterEach(() => {
    mock.restoreAll()
    ;(globalThis as any).document = originalDocument
  })

  test('should be loading while a Mermaid diagram is pending', () => {
    fakeMermaidPage()

    assert.equal(previewEnvironment().isLoading(), true)
  })

  test('should stop loading once a Mermaid diagram is rendered', async () => {
    const image = fakeMermaidPage()

    await renderMermaid(image, async () => ({ svg: '<svg></svg>' }))

    assert.equal(previewEnvironment().isLoading(), false)
  })

  test('should stop loading when a Mermaid diagram fails to render', async () => {
    const image = fakeMermaidPage()

    await renderMermaid(image, async () => {
      throw new Error('Parse error')
    })

    assert.equal(image.hasAttribute(MERMAID_ERROR_ATTRIBUTE), true)
    assert.equal(previewEnvironment().isLoading(), false)
  })

  test('should be loading again when a morph updates a failed Mermaid diagram', async () => {
    const image = fakeMermaidPage()

    await renderMermaid(image, async () => {
      throw new Error('Parse error')
    })
    image.removeAttribute(MERMAID_ERROR_ATTRIBUTE)

    assert.equal(previewEnvironment().isLoading(), true)
  })

  test('should be loading while a PlantUML diagram waits for its render', () => {
    const images = [{ hasAttribute: () => false }]
    ;(globalThis as any).document = {
      readyState: 'complete',
      querySelectorAll: (selector: string) =>
        selector.includes(`img[src^="${PLANTUML_SOURCE_DATA_URI_PREFIX}"]`)
          ? images
          : [],
    }
    assert.equal(previewEnvironment().isLoading(), true)
    images.length = 0
    assert.equal(previewEnvironment().isLoading(), false)
  })
})
