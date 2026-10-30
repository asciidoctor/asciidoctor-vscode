import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { generateNonce } from '../../features/preview/nonce.js'

describe('generateNonce', () => {
  test('generates 128 bits encoded as hexadecimal', () => {
    assert.match(generateNonce(), /^[0-9a-f]{32}$/)
  })

  test('generates a different value on each call', () => {
    const nonces = new Set(Array.from({ length: 100 }, generateNonce))
    assert.equal(nonces.size, 100)
  })
})
