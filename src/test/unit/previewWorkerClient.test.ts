// These tests run the worker thread compiled by `npm run build-test`, next to
// this file, in plain Node: they also check that the worker thread does not
// depend on the VS Code API (#1245).
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import {
  convertForPreview,
  resolveWebviewResources,
} from '../../features/preview/previewConversion.js'
import {
  PreviewWorkerClient,
  PreviewWorkerUnavailableError,
} from '../../features/preview/previewWorkerClient.js'
import {
  asTestWebviewUri,
  fakeHost,
  previewRequest,
  withoutNonce,
} from './previewFixtures.js'

const workerUrl = new URL(
  '../../features/preview/previewWorker.js',
  import.meta.url,
)

function workspaceExtensions(...files: string[]) {
  return { enableKroki: false, workspaceExtensionFiles: files }
}

describe('PreviewWorkerClient', () => {
  let directory: string
  // An extension whose `crash:now[]` macro ends the worker thread.
  let crashExtension: string
  // An extension whose `fail:now[]` macro throws.
  let failExtension: string

  before(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'preview-worker-'))
    crashExtension = path.join(directory, 'crash.js')
    await writeFile(
      crashExtension,
      `module.exports.register = (registry) => {
        registry.inlineMacro('crash', function () {
          this.process(() => process.exit(3))
        })
      }`,
    )
    failExtension = path.join(directory, 'fail.js')
    await writeFile(
      failExtension,
      `module.exports.register = (registry) => {
        registry.inlineMacro('fail', function () {
          this.process(() => { throw new Error('the macro failed') })
        })
      }`,
    )
  })

  after(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('converts like the extension host does', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host } = fakeHost()
      // `reproducible` drops the time of the conversion from the footer, which
      // differs between both conversions when they straddle a second.
      const request = previewRequest(
        '= Title\n:reproducible:\n:source-highlighter: highlight.js\n\n== Section\n\n[source,ruby]\n----\nputs 1\n----\n\nimage::diagram.png[]',
      )
      const inWorker = await client.convert(request, host)
      const inProcess = await convertForPreview(request, host)
      assert.equal(inWorker.document, undefined)
      assert.deepEqual(inWorker.resources, inProcess.resources)
      assert.equal(
        withoutNonce(
          resolveWebviewResources(
            inWorker.html,
            inWorker.resources,
            asTestWebviewUri,
          ),
        ),
        withoutNonce(
          resolveWebviewResources(
            inProcess.html,
            inProcess.resources,
            asTestWebviewUri,
          ),
        ),
      )
    } finally {
      client.dispose()
    }
  })

  test('reads files and warns through the host of the conversion', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host, reads, warnings } = fakeHost({
        '/docs/logo.png': new Uint8Array([1, 2, 3]),
      })
      const { html } = await client.convert(
        previewRequest(
          ':data-uri:\n\nimage::logo.png[]\n\nimage::missing.png[]',
        ),
        host,
      )
      assert.deepEqual(reads, ['/docs/logo.png', '/docs/missing.png'])
      assert.ok(html.includes('src="data:image/png;base64,AQID"'), html)
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /missing\.png/)
    } finally {
      client.dispose()
    }
  })

  test('converts the documents one after the other', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host } = fakeHost()
      const results = await Promise.all(
        ['one', 'two', 'three'].map((text) =>
          client.convert(previewRequest(text), host),
        ),
      )
      assert.deepEqual(
        results.map(({ html }) => html.match(/<p>(\w+)<\/p>/)?.[1]),
        ['one', 'two', 'three'],
      )
    } finally {
      client.dispose()
    }
  })

  test('rejects with the error of a conversion that fails', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host } = fakeHost()
      await assert.rejects(
        client.convert(
          previewRequest('fail:now[]', {
            extensions: workspaceExtensions(failExtension),
          }),
          host,
        ),
        (error: Error) =>
          !(error instanceof PreviewWorkerUnavailableError) &&
          /the macro failed/.test(error.message),
      )
      // The worker thread is still usable.
      const { html } = await client.convert(previewRequest('Hello'), host)
      assert.ok(html.includes('<p>Hello</p>'))
    } finally {
      client.dispose()
    }
  })

  test('is unavailable when the worker thread crashes, then starts a new one', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host } = fakeHost()
      await assert.rejects(
        client.convert(
          previewRequest('crash:now[]', {
            extensions: workspaceExtensions(crashExtension),
          }),
          host,
        ),
        (error: Error) =>
          error instanceof PreviewWorkerUnavailableError &&
          /exited with code 3/.test(error.message),
      )
      const { html } = await client.convert(previewRequest('Hello'), host)
      assert.ok(html.includes('<p>Hello</p>'))
    } finally {
      client.dispose()
    }
  })

  test('is no longer started once it failed too many times', async () => {
    const client = new PreviewWorkerClient(workerUrl, 1)
    try {
      const { host } = fakeHost()
      const crash = previewRequest('crash:now[]', {
        extensions: workspaceExtensions(crashExtension),
      })
      await assert.rejects(
        client.convert(crash, host),
        PreviewWorkerUnavailableError,
      )
      await assert.rejects(
        client.convert(previewRequest('Hello'), host),
        (error: Error) =>
          error instanceof PreviewWorkerUnavailableError &&
          /failed 1 times/.test(error.message),
      )
    } finally {
      client.dispose()
    }
  })

  test('is unavailable when the worker thread cannot start', async () => {
    const client = new PreviewWorkerClient(
      new URL('./missing-worker.js', import.meta.url),
    )
    try {
      const { host } = fakeHost()
      await assert.rejects(
        client.convert(previewRequest('Hello'), host),
        PreviewWorkerUnavailableError,
      )
    } finally {
      client.dispose()
    }
  })

  test('is unavailable when the request cannot be sent', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    try {
      const { host } = fakeHost()
      await assert.rejects(
        client.convert(
          previewRequest('Hello', { attributes: { fn: () => 'x' } }),
          host,
        ),
        (error: Error) =>
          error instanceof PreviewWorkerUnavailableError &&
          /unable to send/.test(error.message),
      )
    } finally {
      client.dispose()
    }
  })

  test('rejects the pending conversions when disposed', async () => {
    const client = new PreviewWorkerClient(workerUrl)
    const { host } = fakeHost()
    const conversion = client.convert(previewRequest('Hello'), host)
    client.dispose()
    await assert.rejects(conversion, PreviewWorkerUnavailableError)
    await assert.rejects(
      client.convert(previewRequest('Hello'), host),
      PreviewWorkerUnavailableError,
    )
  })
})
