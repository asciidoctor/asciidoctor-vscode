import assert from 'node:assert/strict'
import { after, afterEach, before, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import type { AsciidocContributionProvider } from '../features/extensionContributions.js'
import type {
  PreviewHost,
  PreviewRequest,
} from '../features/preview/previewConversion.js'
import {
  type PreviewWorker,
  PreviewWorkerClient,
  PreviewWorkerUnavailableError,
} from '../features/preview/previewWorkerClient.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import {
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  cspSource = 'test-csp-source'

  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return resource.with({ scheme: 'https', authority: 'webview.test' })
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return this.asWebviewUri(
      vscode.Uri.joinPath(extensionContext.extensionUri, ...pathSegments),
    ).toString()
  }
}

function contributionProvider(): AsciidocContributionProvider {
  return {
    extensionUri: extensionContext.extensionUri,
    onContributionsChanged: () =>
      new vscode.Disposable(() => {
        // noop
      }),
    contributions: {
      previewScripts: [],
      previewStyles: [],
      previewResourceRoots: [],
    },
    dispose() {
      // noop
    },
  }
}

function newEngine(previewWorker?: PreviewWorker): AsciidocEngine {
  return new AsciidocEngine(
    contributionProvider(),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    previewWorker,
  )
}

async function renderPreview(engine: AsciidocEngine, uri: vscode.Uri) {
  const { html } = await engine.convertFromUri(
    uri,
    extensionContext,
    new TestWebviewResourceProvider(),
  )
  return html
}

/** Removes the nonce, regenerated on each conversion. */
function withoutNonce(html: string): string {
  const nonce = html.match(/nonce-([^']+)'/)?.[1]
  return nonce === undefined ? html : html.split(nonce).join('NONCE')
}

/** A worker that records the requests it is sent. */
class RecordingWorker implements PreviewWorker {
  readonly requests: PreviewRequest[] = []

  constructor(private readonly delegate?: PreviewWorker) {}

  convert(request: PreviewRequest, host: PreviewHost) {
    this.requests.push(request)
    return this.delegate === undefined
      ? Promise.reject(new PreviewWorkerUnavailableError('no worker'))
      : this.delegate.convert(request, host)
  }

  dispose() {
    this.delegate?.dispose()
  }
}

describe('Preview conversion in a worker thread', () => {
  // Compiled next to this file by `npm run build-test`.
  const workerUrl = new URL(
    '../features/preview/previewWorker.js',
    import.meta.url,
  )
  let worker: PreviewWorkerClient
  const createdFiles: vscode.Uri[] = []

  before(async () => {
    worker = new PreviewWorkerClient(workerUrl)
    createdFiles.push(await createDirectory('preview-worker'))
    await createFile(
      ':product: Asciidoctor',
      'preview-worker',
      '.asciidoctorconfig',
    )
    await createFile(
      'Included from {product}.',
      'preview-worker',
      'partial.adoc',
    )
    await createFile(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      'preview-worker',
      'images',
      'logo.svg',
    )
  })

  after(async () => {
    worker.dispose()
    await removeFiles(createdFiles)
  })

  test('renders the same preview as the extension host', async () => {
    const uri = await createFile(
      `= Preview in a worker
:source-highlighter: highlight.js
:imagesdir: images

== Section

include::partial.adoc[]

[source,ruby]
----
puts 1
----

image::logo.svg[]
`,
      'preview-worker',
      'document.adoc',
    )
    const recordingWorker = new RecordingWorker(worker)
    const inWorker = await renderPreview(newEngine(recordingWorker), uri)
    const inProcess = await renderPreview(newEngine(), uri)
    assert.equal(recordingWorker.requests.length, 1)
    assert.ok(inWorker.includes('Included from Asciidoctor.'), inWorker)
    assert.ok(
      inWorker.includes(
        `<base href="${new TestWebviewResourceProvider().asWebviewUri(uri)}">`,
      ),
      inWorker,
    )
    assert.equal(withoutNonce(inWorker), withoutNonce(inProcess))
  })

  test('embeds the images read through the extension host', async () => {
    const uri = await createFile(
      ':data-uri:\n:imagesdir: images\n\nimage::logo.svg[]',
      'preview-worker',
      'data-uri.adoc',
    )
    const html = await renderPreview(newEngine(worker), uri)
    assert.match(html, /src="data:image\/svg\+xml;base64,[^"]+"/)
  })

  test('falls back to the extension host when the worker thread is unavailable', async () => {
    const uri = await createFile(
      'Rendered anyway',
      'preview-worker',
      'fallback.adoc',
    )
    const recordingWorker = new RecordingWorker()
    const html = await renderPreview(newEngine(recordingWorker), uri)
    assert.equal(recordingWorker.requests.length, 1)
    assert.ok(html.includes('<p>Rendered anyway</p>'), html)
  })

  describe('Antora documents', () => {
    afterEach(async () => {
      await resetAntoraSupport()
    })

    test('are converted in the extension host', async () => {
      await createFile(
        'name: "worker"\nversion: "1.0"\n',
        'preview-worker',
        'antora',
        'antora.yml',
      )
      const uri = await createFile(
        '= Antora page\n\nAn Antora page',
        'preview-worker',
        'antora',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      await enableAntoraSupport()
      const recordingWorker = new RecordingWorker(worker)
      const html = await renderPreview(newEngine(recordingWorker), uri)
      assert.equal(recordingWorker.requests.length, 0)
      assert.ok(html.includes('An Antora page'), html)
    })
  })
})
