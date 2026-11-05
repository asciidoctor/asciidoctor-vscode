import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ParseCache } from '../../features/asciidoctor/parseCache.js'

function counter() {
  let calls = 0
  return {
    parse: (value: string) => () => {
      calls += 1
      return Promise.resolve(value)
    },
    get calls() {
      return calls
    },
  }
}

describe('ParseCache', () => {
  test('reuses the parse of the same text', async () => {
    const cache = new ParseCache<string>()
    const parses = counter()
    assert.equal(
      await cache.get('a', { text: 'text' }, parses.parse('first')),
      'first',
    )
    assert.equal(
      await cache.get('a', { text: 'text' }, parses.parse('second')),
      'first',
    )
    assert.equal(parses.calls, 1)
  })

  test('shares a pending parse', async () => {
    const cache = new ParseCache<string>()
    let resolve: (value: string) => void = () => {
      // Replaced by the resolver of the pending parse.
    }
    const promise = new Promise<string>((r) => {
      resolve = r
    })
    let calls = 0
    const parse = () => {
      calls += 1
      return promise
    }
    const first = cache.get('a', { text: 'text' }, parse)
    const second = cache.get('a', { text: 'text' }, parse)
    resolve('result')
    assert.deepEqual(await Promise.all([first, second]), ['result', 'result'])
    assert.equal(calls, 1)
  })

  test('parses again when the text changes', async () => {
    const cache = new ParseCache<string>()
    const parses = counter()
    await cache.get('a', { text: 'text' }, parses.parse('first'))
    assert.equal(
      await cache.get('a', { text: 'edited text' }, parses.parse('second')),
      'second',
    )
    assert.equal(parses.calls, 2)
  })

  test('parses again when the options change', async () => {
    const cache = new ParseCache<string>()
    const parses = counter()
    await cache.get('a', { text: 'text', options: 'x' }, parses.parse('first'))
    assert.equal(
      await cache.get(
        'a',
        { text: 'text', options: 'y' },
        parses.parse('second'),
      ),
      'second',
    )
    assert.equal(parses.calls, 2)
  })

  test('keeps the documents apart', async () => {
    const cache = new ParseCache<string>()
    const parses = counter()
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    assert.equal(await cache.get('b', { text: 'text' }, parses.parse('b')), 'b')
    assert.equal(
      await cache.get('a', { text: 'text' }, parses.parse('other')),
      'a',
    )
    assert.equal(parses.calls, 2)
  })

  test('does not keep a failed parse', async () => {
    const cache = new ParseCache<string>()
    await assert.rejects(
      cache.get('a', { text: 'text' }, () => Promise.reject(new Error('boom'))),
    )
    assert.equal(
      await cache.get('a', { text: 'text' }, () => Promise.resolve('retried')),
      'retried',
    )
  })

  test('drops the least recently used document', async () => {
    const cache = new ParseCache<string>(2)
    const parses = counter()
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    await cache.get('b', { text: 'text' }, parses.parse('b'))
    // Use `a` again, so that `b` becomes the least recently used document.
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    await cache.get('c', { text: 'text' }, parses.parse('c'))
    assert.equal(cache.size, 2)
    assert.equal(parses.calls, 3)
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    assert.equal(parses.calls, 3)
    await cache.get('b', { text: 'text' }, parses.parse('b'))
    assert.equal(parses.calls, 4)
  })

  test('forgets a document or every document', async () => {
    const cache = new ParseCache<string>()
    const parses = counter()
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    await cache.get('b', { text: 'text' }, parses.parse('b'))
    cache.delete('a')
    await cache.get('a', { text: 'text' }, parses.parse('a'))
    assert.equal(parses.calls, 3)
    cache.clear()
    assert.equal(cache.size, 0)
  })
})
