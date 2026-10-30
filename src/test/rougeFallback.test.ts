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

// Rouge is not supported in the preview, which falls back to Highlight.js.
describe('source-highlighter set to rouge in the preview', () => {
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

  test('falls back to Highlight.js when set in the document header', async () => {
    const document = await createFile(
      `= Doc\n:source-highlighter: rouge\n\n${SOURCE_BLOCK}`,
      'rouge-header.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('falls back to Highlight.js when set in .asciidoctorconfig', async () => {
    const configFile = await createFile(
      ':source-highlighter: rouge',
      '.asciidoctorconfig',
    )
    createdFiles.push(configFile)
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'rouge-config.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('falls back to Highlight.js when set in asciidoctorAttributes', async () => {
    await vscode.workspace
      .getConfiguration('asciidoc.preview', null)
      .update('asciidoctorAttributes', { 'source-highlighter': 'rouge' })
    const document = await createFile(
      `= Doc\n\n${SOURCE_BLOCK}`,
      'rouge-setting.adoc',
    )
    createdFiles.push(document)
    await assertHighlightJs(document)
  })

  test('keeps another highlighter set in the document header', async () => {
    const document = await createFile(
      `= Doc\n:source-highlighter: prettify\n\n${SOURCE_BLOCK}`,
      'other-highlighter.adoc',
    )
    createdFiles.push(document)
    const { sourceHighlighter } = await renderPreview(document)
    assert.equal(sourceHighlighter, 'prettify')
  })
})
