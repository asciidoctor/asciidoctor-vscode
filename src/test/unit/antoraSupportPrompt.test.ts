import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  type AntoraSupportPrompt,
  createAntoraSupportPromptHandler,
} from '../../features/antora/antoraSupportPrompt.js'

/** Let queued microtasks (the awaited steps of the handler) run to completion. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

interface Recording extends AntoraSupportPrompt<string> {
  calls: {
    appliesToAntora: number
    askToEnable: number
    setDecision: boolean[]
    enableFeatures: number
    dispose: number
  }
}

function recordingPrompt(
  config: {
    /** The answer to resolve `askToEnable` with (default `true`). */
    answer?: boolean | (() => Promise<boolean | undefined>)
    /** Whether the document applies to Antora (default `true`). */
    applies?: boolean
    /** The decision already on record (default none). */
    decision?: boolean
    /** Whether the prompt is enabled by configuration (default `true`). */
    promptEnabled?: boolean | (() => boolean)
  } = {},
): Recording {
  const calls = {
    appliesToAntora: 0,
    askToEnable: 0,
    setDecision: [] as boolean[],
    enableFeatures: 0,
    dispose: 0,
  }
  let decision = config.decision
  let answer: () => Promise<boolean | undefined>
  if (typeof config.answer === 'function') {
    answer = config.answer
  } else {
    const value = config.answer ?? true
    answer = async () => value
  }
  return {
    calls,
    isPromptEnabled: () => {
      if (typeof config.promptEnabled === 'function') {
        return config.promptEnabled()
      }
      return config.promptEnabled ?? true
    },
    appliesToAntora: async () => {
      calls.appliesToAntora++
      return config.applies ?? true
    },
    askToEnable: () => {
      calls.askToEnable++
      return answer()
    },
    getDecision: () => decision,
    setDecision: async (enabled) => {
      calls.setDecision.push(enabled)
      decision = enabled
    },
    enableFeatures: () => {
      calls.enableFeatures++
    },
    dispose: () => {
      calls.dispose++
    },
  }
}

describe('createAntoraSupportPromptHandler', () => {
  test('asks once, then enables and stops listening when the user accepts', async () => {
    const prompt = recordingPrompt({ answer: true })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    assert.strictEqual(prompt.calls.askToEnable, 1)
    assert.deepStrictEqual(prompt.calls.setDecision, [true])
    assert.strictEqual(prompt.calls.enableFeatures, 1)
    assert.strictEqual(prompt.calls.dispose, 1)
  })

  test('persists the refusal without enabling when the user declines', async () => {
    const prompt = recordingPrompt({ answer: false })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    assert.deepStrictEqual(prompt.calls.setDecision, [false])
    assert.strictEqual(prompt.calls.enableFeatures, 0)
    assert.strictEqual(prompt.calls.dispose, 1)
  })

  test('leaves the decision unmade when the user defers (No / dismiss)', async () => {
    const prompt = recordingPrompt({ answer: async () => undefined })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    // Deferring ("not now" or X / Escape) is not a final choice: nothing is
    // persisted and the features stay off, but the listener is disposed to stop
    // nagging within the session.
    assert.strictEqual(prompt.calls.askToEnable, 1)
    assert.strictEqual(prompt.calls.setDecision.length, 0)
    assert.strictEqual(prompt.calls.enableFeatures, 0)
    assert.strictEqual(prompt.calls.dispose, 1)
  })

  test('does not even look for an Antora config when the prompt is disabled', async () => {
    const prompt = recordingPrompt({ promptEnabled: false })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    // With the prompt turned off (the default), opening documents must not
    // trigger the potentially expensive antora.yml lookup…
    assert.strictEqual(prompt.calls.appliesToAntora, 0)
    assert.strictEqual(prompt.calls.askToEnable, 0)
    // …but the handler keeps listening: the user may enable the setting later
    // in the session.
    assert.strictEqual(prompt.calls.dispose, 0)
  })

  test('asks again once the prompt setting is turned on within the session', async () => {
    let promptEnabled = false
    const prompt = recordingPrompt({
      answer: true,
      promptEnabled: () => promptEnabled,
    })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')
    assert.strictEqual(prompt.calls.askToEnable, 0)

    promptEnabled = true
    await handle('b.adoc')
    assert.strictEqual(prompt.calls.askToEnable, 1)
    assert.deepStrictEqual(prompt.calls.setDecision, [true])
  })

  test('does not prompt for a document outside an Antora project', async () => {
    const prompt = recordingPrompt({ applies: false })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    assert.strictEqual(prompt.calls.askToEnable, 0)
    assert.strictEqual(prompt.calls.setDecision.length, 0)
    assert.strictEqual(prompt.calls.dispose, 0)
  })

  test('honours a decision already made and stops listening without prompting', async () => {
    const prompt = recordingPrompt({ decision: true })
    const handle = createAntoraSupportPromptHandler(prompt)

    await handle('a.adoc')

    assert.strictEqual(prompt.calls.appliesToAntora, 0)
    assert.strictEqual(prompt.calls.askToEnable, 0)
    assert.strictEqual(prompt.calls.dispose, 1)
  })

  test('shows a single prompt while one is still pending (ignored notification)', async () => {
    let resolveAnswer: ((value: boolean) => void) | undefined
    const prompt = recordingPrompt({
      answer: () =>
        new Promise<boolean>((resolve) => {
          resolveAnswer = resolve
        }),
    })
    const handle = createAntoraSupportPromptHandler(prompt)

    // The first document opens the prompt, which stays pending.
    const pending = handle('a.adoc')
    await flush()
    assert.strictEqual(prompt.calls.askToEnable, 1)

    // A second document opening while the prompt is pending must not stack one.
    await handle('b.adoc')
    assert.strictEqual(prompt.calls.askToEnable, 1)

    // Resolve the pending prompt and let it settle to avoid a dangling promise.
    resolveAnswer?.(false)
    await pending
  })

  test('asks once when several Antora documents open concurrently', async () => {
    const prompt = recordingPrompt({ answer: true })
    const handle = createAntoraSupportPromptHandler(prompt)

    await Promise.all([handle('a.adoc'), handle('b.adoc'), handle('c.adoc')])

    assert.strictEqual(prompt.calls.askToEnable, 1)
    assert.deepStrictEqual(prompt.calls.setDecision, [true])
  })
})
