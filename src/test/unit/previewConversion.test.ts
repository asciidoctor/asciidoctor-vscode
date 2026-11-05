// These tests run in plain Node, where `vscode` cannot be resolved: importing
// the preview conversion also checks that it does not depend on the VS Code
// API, so that it can run in a worker thread (#1245).
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { URI } from 'vscode-uri'
import {
  convertForPreview,
  resolveWebviewResources,
  WebviewResourceRecorder,
} from '../../features/preview/previewConversion.js'
import {
  asTestWebviewUri,
  fakeHost,
  fileUri,
  previewRequest,
  withoutNonce,
} from './previewFixtures.js'

async function render(...args: Parameters<typeof convertForPreview>) {
  const result = await convertForPreview(...args)
  return {
    ...result,
    html: resolveWebviewResources(
      result.html,
      result.resources,
      asTestWebviewUri,
    ),
  }
}

describe('convertForPreview', () => {
  test('replaces the local resources with webview URIs', async () => {
    const { host } = fakeHost()
    const { html, resources } = await render(
      previewRequest('= Title\n\nHello'),
      host,
    )
    assert.match(html, /<base href="webview:\/docs\/index\.adoc">/)
    assert.match(html, /src="webview:\/extension\/dist\/pre\.js"/)
    assert.ok(html.includes('csp-source'), html)
    assert.ok(!html.includes('vscode-asciidoc-resource:'), html)
    assert.ok(Object.keys(resources).length > 0)
    assert.ok(html.includes('<p>Hello</p>'), html)
  })

  test('returns the same HTML for the same document', async () => {
    const { host } = fakeHost()
    const request = previewRequest('= Title\n\n[stem]\n++++\nx^2\n++++')
    const first = await render(request, host)
    const second = await render(request, host)
    assert.equal(withoutNonce(first.html), withoutNonce(second.html))
  })

  test('reads the images embedded with data-uri through the host', async () => {
    const { host, reads } = fakeHost({
      '/docs/images/logo.png': new Uint8Array([1, 2, 3]),
    })
    const { html } = await render(
      previewRequest(':data-uri:\n:imagesdir: images\n\nimage::logo.png[]'),
      host,
    )
    assert.deepEqual(reads, ['/docs/images/logo.png'])
    assert.ok(html.includes('src="data:image/png;base64,AQID"'), html)
  })

  test('warns through the host when an image cannot be embedded', async () => {
    const { host, warnings } = fakeHost()
    await render(previewRequest(':data-uri:\n\nimage::missing.png[]'), host)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /missing\.png/)
  })

  test('prepends the content of .asciidoctorconfig', async () => {
    const { host } = fakeHost()
    const { html } = await render(
      previewRequest('Product: {product}', {
        asciidoctorConfig: ':product: Asciidoctor',
      }),
      host,
    )
    assert.ok(html.includes('Product: Asciidoctor'), html)
  })

  test('loads the Highlight.js theme and scripts of the extension', async () => {
    const { host } = fakeHost()
    const { html } = await render(
      previewRequest(
        ':source-highlighter: highlight.js\n\n[source,ruby]\n----\nputs 1\n----',
        { darkTheme: true },
      ),
      host,
    )
    assert.ok(
      html.includes(
        'href="webview:/extension/media/highlightjs/styles/github-dark.min.css"',
      ),
      html,
    )
    assert.ok(
      html.includes(
        'src="webview:/extension/media/highlightjs/highlight.min.js"',
      ),
      html,
    )
  })

  test('registers the workspace extensions and reports the ones that fail', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'preview-conversion-'))
    try {
      const extension = path.join(directory, 'shout.js')
      await writeFile(
        extension,
        `module.exports.register = (registry) => {
          registry.inlineMacro('shout', function () {
            this.process((parent, target) => this.createInline(parent, 'quoted', target.toUpperCase()))
          })
        }`,
      )
      const broken = path.join(directory, 'broken.js')
      await writeFile(broken, 'throw new Error("broken extension")')
      const { host } = fakeHost()
      const { html, extensionFailures } = await render(
        previewRequest('shout:hello[]', {
          extensions: {
            enableKroki: false,
            workspaceExtensionFiles: [extension, broken],
          },
        }),
        host,
      )
      assert.ok(html.includes('HELLO'), html)
      assert.equal(extensionFailures.length, 1)
      assert.equal(extensionFailures[0].file, broken)
      assert.match(extensionFailures[0].error, /broken extension/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('describes the duration of the conversion', async () => {
    const { host } = fakeHost()
    const { timing } = await render(previewRequest('Hello'), host)
    assert.match(
      timing,
      /^Converted for the preview file:\/\/\/docs\/index\.adoc \(1 line, .*\) in \d+ ms \(header: .*, setup: .*, load: .*, annotate: .*, convert: .*\)$/,
    )
  })
})

describe('resolveWebviewResources', () => {
  test('leaves the tokens that were not recorded', () => {
    const recorder = new WebviewResourceRecorder(
      URI.from(fileUri('/extension')),
      'csp',
    )
    const token = recorder.asMediaWebViewSrc('media', 'a.css')
    const forged = token.replace(/:\/\/[^~]+~/, '://Zm9yZ2Vk~')
    assert.equal(
      resolveWebviewResources(
        `${token} ${forged}`,
        recorder.resources,
        asTestWebviewUri,
      ),
      `webview:/extension/media/a.css ${forged}`,
    )
  })

  test('gives the same token to the same resource', () => {
    const recorder = new WebviewResourceRecorder(
      URI.from(fileUri('/extension')),
      'csp',
    )
    assert.equal(
      recorder.asWebviewUri(URI.file('/docs/a b.png')),
      recorder.asWebviewUri(URI.file('/docs/a b.png')),
    )
    assert.notEqual(
      recorder.asWebviewUri(URI.file('/docs/a.png')),
      recorder.asWebviewUri(URI.file('/docs/b.png')),
    )
  })
})
