import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { requireFresh } from '../../core/requireExtension.js'

// Regression test for https://github.com/asciidoctor/asciidoctor-vscode/issues/1179:
// the extension host loads this bundle as native ESM, which has no ambient
// `require` — a bare `require(extPath)` call (as `registerExtensionsInWorkspace`
// used before the fix) throws `ReferenceError: require is not defined` before a
// workspace `.asciidoctor/lib` extension is ever loaded. `requireFresh` must work
// from exactly this kind of module.
describe('requireFresh', () => {
  test('runs in a module with no ambient require', () => {
    assert.equal(typeof require, 'undefined')
  })

  test('loads a CommonJS extension module by absolute path', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'asciidoctor-vscode-'))
    const modulePath = path.join(dir, 'ext.cjs')
    await fs.writeFile(
      modulePath,
      'module.exports = { register: (registry) => registry.push("first") }',
    )

    const calls: string[] = []
    const extjs = requireFresh(modulePath) as {
      register(registry: string[]): void
    }
    extjs.register(calls)

    assert.deepEqual(calls, ['first'])
  })

  test('picks up an edited file instead of returning a stale cached copy', async () => {
    const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'asciidoctor-vscode-')),
    )
    const modulePath = path.join(dir, 'ext.cjs')

    await fs.writeFile(
      modulePath,
      'module.exports = { register: (registry) => registry.push("v1") }',
    )
    const firstCalls: string[] = []
    ;(
      requireFresh(modulePath) as { register(registry: string[]): void }
    ).register(firstCalls)
    assert.deepEqual(firstCalls, ['v1'])

    await fs.writeFile(
      modulePath,
      'module.exports = { register: (registry) => registry.push("v2") }',
    )
    const secondCalls: string[] = []
    ;(
      requireFresh(modulePath) as { register(registry: string[]): void }
    ).register(secondCalls)
    assert.deepEqual(secondCalls, ['v2'])
  })
})
