import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import {
  holdViewport,
  type ViewportHoldEnvironment,
} from '../../../preview-src/viewport-hold.js'

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
