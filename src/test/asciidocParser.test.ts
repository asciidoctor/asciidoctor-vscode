import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { AsciidocEngine } from '../features/asciidoctor/asciidocEngine.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import {
  AsciidocContributionProvider,
  AsciidocContributions,
} from '../features/extensionContributions.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'
import {
  createDirectory,
  createFile,
  enableAntoraSupport,
  removeFiles,
  resetAntoraSupport,
} from './workspaceHelper.js'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return vscode.Uri.file(resource.path)
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return pathSegments.toString()
  }

  cspSource = 'cspSource'
}

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts: vscode.Uri[] = []
  readonly previewStyles: vscode.Uri[] = []
  readonly previewResourceRoots: vscode.Uri[] = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri
  }

  onContributionsChanged: vscode.Event<this> = () =>
    new vscode.Disposable(() => {
      // noop
    })

  readonly contributions = new EmptyAsciidocContributions()

  dispose() {
    // noop
  }
}

describe('AsciiDoc parser with Antora support enabled', {
  timeout: 60000,
}, () => {
  test('convert Antora page', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('docs'))
      await createFile(
        `name: "antora"
version: "1.1.1"
title: Antora
asciidoc:
  attributes:
    url-vscode-marketplace: https://marketplace.visualstudio.com/vscode
`,
        'docs',
        'antora.yml',
      )
      const asciidocFile = await createFile(
        '',
        'docs',
        'modules',
        'ROOT',
        'pages',
        'index.adoc',
      )
      await enableAntoraSupport()
      const asciidocParser = new AsciidocEngine(
        new AsciidocContributionProviderTest(extensionContext.extensionUri),
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(
          AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
        ),
      )
      const result = await asciidocParser.convertFromTextDocument(
        new InMemoryDocument(
          asciidocFile,
          'Download from the {url-vscode-marketplace}[Visual Studio Code Marketplace].',
        ),
        extensionContext,
        new TestWebviewResourceProvider(),
      )
      assert.strictEqual(
        result.html.includes(
          '<p>Download from the <a href="https://marketplace.visualstudio.com/vscode" data-href="https://marketplace.visualstudio.com/vscode">Visual Studio Code Marketplace</a>.</p>',
        ),
        true,
      )
    } finally {
      await removeFiles(createdFiles)
      await resetAntoraSupport()
    }
  })
})

describe('AsciiDoc parser interdocument link fragment (#705)', () => {
  function createEngine() {
    return new AsciidocEngine(
      new AsciidocContributionProviderTest(extensionContext.extensionUri),
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
    )
  }

  function readDataSettings(html: string): { [key: string]: any } {
    const match = html.match(/data-settings="([^"]*)"/)
    assert.ok(match, `no data-settings found in:\n${html}`)
    return JSON.parse(match[1].replace(/&quot;/g, '"'))
  }

  // The webview reads the scroll-to anchor from `data-settings`; this checks the
  // `fragment` passed to `convertFromTextDocument` reaches it through the engine.
  test('carries the fragment through to the rendered data-settings', async () => {
    const result = await createEngine().convertFromTextDocument(
      new InMemoryDocument(
        vscode.Uri.file('/fragment-test.adoc'),
        '= Title\n\nSome content',
      ),
      extensionContext,
      new TestWebviewResourceProvider(),
      undefined, // line
      'inline-anchor-paragraph', // fragment
    )
    assert.strictEqual(
      readDataSettings(result.html).fragment,
      'inline-anchor-paragraph',
    )
  })

  test('leaves the fragment unset when none is provided', async () => {
    const result = await createEngine().convertFromTextDocument(
      new InMemoryDocument(
        vscode.Uri.file('/fragment-test.adoc'),
        '= Title\n\nSome content',
      ),
      extensionContext,
      new TestWebviewResourceProvider(),
    )
    assert.strictEqual(readDataSettings(result.html).fragment, undefined)
  })
})
