import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { createFile } from './workspaceHelper.js'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  cspSource = 'aaaa'

  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return resource
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return pathSegments.toString()
  }
}

function newEngine(): AsciidocEngine {
  return new AsciidocEngine(
    {
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
    },
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
  )
}

const SOURCE_BLOCK = '[source,ruby]\n----\nputs 1\n----\n'

async function renderPreview(documentUri: vscode.Uri) {
  const { html, document } = await newEngine().convertFromUri(
    documentUri,
    extensionContext,
    new TestWebviewResourceProvider(),
  )
  return {
    html,
    sourceHighlighter: document?.getAttribute('source-highlighter'),
  }
}

// Highlight.js is the only source highlighter available in the preview.
describe('source-highlighter in the preview', () => {
  let createdFiles: vscode.Uri[] = []

  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile, { recursive: true })
    }
    createdFiles = []
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', undefined)
  })

  async function assertHighlightJs(documentUri: vscode.Uri) {
    const { html, sourceHighlighter } = await renderPreview(documentUri)
    assert.ok(html.includes('class="language-ruby hljs"'), html)
    assert.equal(sourceHighlighter, 'highlight.js')
  }

  async function assertDisabled(documentUri: vscode.Uri) {
    const { html, sourceHighlighter } = await renderPreview(documentUri)
    assert.ok(!html.includes('hljs'), html)
    assert.ok(!sourceHighlighter, `unexpected value: ${sourceHighlighter}`)
  }

  for (const value of ['rouge', 'coderay', 'pygments', 'prettify', 'unknown']) {
    test(`resolves ${value} to Highlight.js when set in the document header`, async () => {
      const document = await createFile(
        `= Doc\n:source-highlighter: ${value}\n\n${SOURCE_BLOCK}`,
        `highlighter-header-${value}.adoc`,
      )
      createdFiles.push(document)
      await assertHighlightJs(document)
    })
  }

  test('resolves any value to Highlight.js when set in .asciidoctorconfig', async () => {
    const configFile = await createFile(
      ':source-highlighter: rouge',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'highlighter-config.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('resolves any value to Highlight.js when set in asciidoctorAttributes', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', { 'source-highlighter': 'rouge' })
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'highlighter-setting.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('uses Highlight.js when nothing sets the attribute', async () => {
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'highlighter-default.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('keeps highlighting disabled when the attribute is unset in the document header', async () => {
    const document = await createFile(
      `= Doc\n:!source-highlighter:\n\n${SOURCE_BLOCK}`,
      'highlighter-unset.adoc',
    )
    createdFiles.push(document)
    await assertDisabled(document)
  })

  test('keeps highlighting disabled when the attribute is unset in asciidoctorAttributes', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', { 'source-highlighter!': '' })
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'highlighter-unset-setting.adoc',
    )
    createdFiles.push(document)
    await assertDisabled(document)
  })

  test('keeps highlighting disabled when the attribute is empty in asciidoctorAttributes', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', { 'source-highlighter': '' })
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'highlighter-empty.adoc',
    )
    createdFiles.push(document)
    await assertDisabled(document)
  })
})
