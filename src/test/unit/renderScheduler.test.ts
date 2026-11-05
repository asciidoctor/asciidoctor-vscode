import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  RenderScheduler,
  type RenderSchedulerOptions,
} from '../../features/preview/renderScheduler.js'

// A manual clock: timers only fire when the test advances the time, and each
// render stays in progress until the test finishes it.
function setup(options: Partial<RenderSchedulerOptions> = {}) {
  let now = 0
  let nextId = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  const renders: { startedAt: number; finish: () => void }[] = []
  let running = 0
  let maxRunning = 0

  const scheduler = new RenderScheduler({
    minDelay: () => 500,
    now: () => now,
    setTimer: (callback, ms) => {
      const id = ++nextId
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimer: (id) => {
      timers.delete(id as number)
    },
    render: () =>
      new Promise<void>((resolve) => {
        running++
        maxRunning = Math.max(maxRunning, running)
        renders.push({
          startedAt: now,
          finish: () => {
            running--
            resolve()
          },
        })
      }),
    ...options,
  })

  const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

  return {
    scheduler,
    renders,
    get maxRunning() {
      return maxRunning
    },
    get timerCount() {
      return timers.size
    },
    async advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort(([, a], [, b]) => a.at - b.at)[0]
        if (!due) {
          break
        }
        timers.delete(due[0])
        now = Math.max(now, due[1].at)
        due[1].callback()
        await flush()
      }
      now = target
      await flush()
    },
    async finish(index: number, duration = 0) {
      now += duration
      renders[index].finish()
      await flush()
    },
  }
}

describe('RenderScheduler', () => {
  test('renders the first edit immediately', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    assert.equal(t.renders.length, 1)
    assert.equal(t.renders[0].startedAt, 0)
  })

  test('coalesces the edits made during a render into a single render', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    for (let i = 0; i < 10; i++) {
      t.scheduler.schedule()
      await t.advance(10)
    }
    assert.equal(t.renders.length, 1, 'no render starts while one is running')
    await t.finish(0)
    await t.advance(1000)
    assert.equal(t.renders.length, 2, 'the last edits are rendered once')
  })

  test('waits at least minDelay after the end of a render', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    await t.finish(0, 100) // ends at 100
    t.scheduler.schedule()
    await t.advance(499)
    assert.equal(t.renders.length, 1)
    await t.advance(1)
    assert.equal(t.renders.length, 2)
    assert.equal(t.renders[1].startedAt, 600)
  })

  test('renders immediately an edit made after a quiet period', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    await t.finish(0, 50)
    await t.advance(5000)
    t.scheduler.schedule()
    await t.advance(0)
    assert.equal(t.renders.length, 2)
  })

  test('waits longer after a slow render', async () => {
    const t = setup({ factor: 2 })
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.schedule()
    await t.finish(0, 1000) // ends at 1000, took 1000ms
    await t.advance(1999)
    assert.equal(t.renders.length, 1, 'waits 2 × 1000ms, not 500ms')
    await t.advance(1)
    assert.equal(t.renders.length, 2)
  })

  test('caps the delay computed from a slow render', async () => {
    const t = setup({ factor: 2, maxDelay: 3000 })
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.schedule()
    await t.finish(0, 10000)
    await t.advance(3000)
    assert.equal(t.renders.length, 2)
  })

  test('never runs two renders at the same time', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.renderNow()
    t.scheduler.schedule()
    t.scheduler.renderNow()
    await t.advance(1000)
    assert.equal(t.renders.length, 1)
    assert.equal(t.maxRunning, 1)
  })

  test('renderNow runs right after the running render, without delay', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.renderNow()
    await t.finish(0, 100)
    assert.equal(t.renders.length, 2)
    assert.equal(t.renders[1].startedAt, 100)
  })

  test('renderNow replaces a pending delayed render', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    await t.finish(0)
    t.scheduler.schedule()
    assert.equal(t.timerCount, 1)
    t.scheduler.renderNow()
    await t.advance(0)
    assert.equal(t.renders.length, 2)
    await t.advance(1000)
    assert.equal(t.renders.length, 2, 'the delayed render is not run as well')
  })

  test('cancel drops the pending render', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.schedule()
    t.scheduler.cancel()
    await t.finish(0)
    await t.advance(1000)
    assert.equal(t.renders.length, 1)
  })

  test('keeps scheduling after a failed render', async () => {
    const errors: unknown[] = []
    let calls = 0
    const t = setup({
      render: async () => {
        calls++
        if (calls === 1) {
          throw new Error('boom')
        }
      },
      onError: (error) => errors.push(error),
    })
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.schedule()
    await t.advance(1000)
    assert.equal(calls, 2)
    assert.equal(errors.length, 1)
  })

  test('does nothing once disposed', async () => {
    const t = setup()
    t.scheduler.schedule()
    await t.advance(0)
    t.scheduler.schedule()
    t.scheduler.dispose()
    await t.finish(0)
    t.scheduler.schedule()
    t.scheduler.renderNow()
    await t.advance(1000)
    assert.equal(t.renders.length, 1)
  })
})
