import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  type Block,
  type BlockProcessor,
  type BlockProcessorDslInterface,
  Extensions,
  type Reader,
  type Registry,
} from '@asciidoctor/core'
import {
  ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT,
  type AsciidoctorExtensionContext,
  type AsciidoctorExtensionContributor,
  contributesAsciidoctorExtensions,
  registerContributedAsciidoctorExtensions,
} from '../../features/asciidoctor/asciidoctorExtensionContributions.js'

const context: AsciidoctorExtensionContext = { mode: 'preview' }

interface FakeExtensionOptions {
  id?: string
  contributes?: Record<string, unknown>
  exports?: unknown
  activateError?: Error
}

function fakeExtension(options: FakeExtensionOptions = {}): {
  extension: AsciidoctorExtensionContributor
  activateCalls: number
} {
  let activateCalls = 0
  const extension: AsciidoctorExtensionContributor = {
    id: options.id ?? 'publisher.extension',
    packageJSON: { contributes: options.contributes },
    activate() {
      activateCalls++
      if (options.activateError) {
        return Promise.reject(options.activateError)
      }
      return Promise.resolve(options.exports)
    },
  }
  return {
    extension,
    get activateCalls() {
      return activateCalls
    },
  }
}

const contributingPackageJSON = {
  [ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT]: true,
}

describe('contributesAsciidoctorExtensions', () => {
  test('is true when the contribution point is declared', () => {
    const { extension } = fakeExtension({
      contributes: contributingPackageJSON,
    })
    assert.equal(contributesAsciidoctorExtensions(extension), true)
  })

  test('is false when the contribution point is absent', () => {
    const { extension } = fakeExtension({ contributes: { other: true } })
    assert.equal(contributesAsciidoctorExtensions(extension), false)
  })

  test('is false when there is no contributes section', () => {
    const { extension } = fakeExtension()
    assert.equal(contributesAsciidoctorExtensions(extension), false)
  })

  test('is false when the contribution point is falsy', () => {
    const { extension } = fakeExtension({
      contributes: { [ASCIIDOCTOR_EXTENSIONS_CONTRIBUTION_POINT]: false },
    })
    assert.equal(contributesAsciidoctorExtensions(extension), false)
  })
})

describe('registerContributedAsciidoctorExtensions', () => {
  test('activates contributors and calls their hook with the registry and context', async () => {
    const registry = Extensions.create()
    const documentUri = {
      toString: () => 'file:///doc.adoc',
    } as unknown as AsciidoctorExtensionContext['documentUri']
    let received: { registry?: Registry; context?: unknown } = {}
    const contributor = fakeExtension({
      contributes: contributingPackageJSON,
      exports: {
        registerAsciidoctorExtensions(r: Registry, context: unknown) {
          received = { registry: r, context }
        },
      },
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [contributor.extension],
      registry,
      { documentUri, mode: 'export' },
    )

    assert.deepEqual(failures, [])
    assert.equal(contributor.activateCalls, 1)
    assert.equal(received.registry, registry)
    assert.deepEqual(received.context, { documentUri, mode: 'export' })
  })

  test('awaits asynchronous hooks', async () => {
    const registry = Extensions.create()
    let resolved = false
    const contributor = fakeExtension({
      contributes: contributingPackageJSON,
      exports: {
        async registerAsciidoctorExtensions() {
          await Promise.resolve()
          resolved = true
        },
      },
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [contributor.extension],
      registry,
      context,
    )

    assert.deepEqual(failures, [])
    assert.equal(resolved, true)
  })

  test('skips extensions that do not declare the contribution point', async () => {
    const registry = Extensions.create()
    const nonContributor = fakeExtension({
      contributes: { other: true },
      exports: {
        registerAsciidoctorExtensions() {
          assert.fail('hook should not be called')
        },
      },
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [nonContributor.extension],
      registry,
      context,
    )

    assert.deepEqual(failures, [])
    assert.equal(nonContributor.activateCalls, 0)
  })

  test('reports a failure when the contributor does not expose the hook', async () => {
    const registry = Extensions.create()
    const contributor = fakeExtension({
      id: 'publisher.missing-hook',
      contributes: contributingPackageJSON,
      exports: {},
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [contributor.extension],
      registry,
      context,
    )

    assert.equal(failures.length, 1)
    assert.equal(failures[0].extensionId, 'publisher.missing-hook')
    assert.match(
      failures[0].error.message,
      /does not expose a 'registerAsciidoctorExtensions/,
    )
  })

  test('isolates a throwing hook and keeps processing other contributors', async () => {
    const registry = Extensions.create()
    const failing = fakeExtension({
      id: 'publisher.failing',
      contributes: contributingPackageJSON,
      exports: {
        registerAsciidoctorExtensions() {
          throw new Error('boom')
        },
      },
    })
    let secondCalled = false
    const healthy = fakeExtension({
      id: 'publisher.healthy',
      contributes: contributingPackageJSON,
      exports: {
        registerAsciidoctorExtensions() {
          secondCalled = true
        },
      },
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [failing.extension, healthy.extension],
      registry,
      context,
    )

    assert.equal(secondCalled, true)
    assert.equal(failures.length, 1)
    assert.equal(failures[0].extensionId, 'publisher.failing')
    assert.equal(failures[0].error.message, 'boom')
  })

  test('reports a failure when activation rejects', async () => {
    const registry = Extensions.create()
    const contributor = fakeExtension({
      id: 'publisher.broken-activate',
      contributes: contributingPackageJSON,
      activateError: new Error('activation failed'),
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [contributor.extension],
      registry,
      context,
    )

    assert.equal(failures.length, 1)
    assert.equal(failures[0].extensionId, 'publisher.broken-activate')
    assert.equal(failures[0].error.message, 'activation failed')
  })

  test('lets a contributed extension register a working Asciidoctor.js block', async () => {
    const { load } = await import('@asciidoctor/core')
    const registry = Extensions.create()
    const contributor = fakeExtension({
      contributes: contributingPackageJSON,
      exports: {
        registerAsciidoctorExtensions(r: Registry) {
          r.block(
            'shout',
            function (this: BlockProcessor & BlockProcessorDslInterface) {
              const self = this
              self.onContext('paragraph')
              self.process((parent, reader) =>
                self.createBlock(
                  parent as Block,
                  'paragraph',
                  (reader as Reader).getLines().join('\n').toUpperCase(),
                  {},
                ),
              )
            },
          )
        },
      },
    })

    const failures = await registerContributedAsciidoctorExtensions(
      [contributor.extension],
      registry,
      context,
    )
    assert.deepEqual(failures, [])

    const doc = await load('[shout]\nhello world', {
      extension_registry: registry,
    })
    assert.match(await doc.convert(), /HELLO WORLD/)
  })
})
