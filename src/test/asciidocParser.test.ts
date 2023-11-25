import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { AsciidocContributionProvider, AsciidocContributions } from '../asciidocExtensions'
import { WebviewResourceProvider } from '../util/resources'
import { extensionContext } from './helper'
import { AsciidocEngine } from '../asciidocEngine'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { InMemoryDocument } from './inMemoryDocument'
import { createDirectory, createFile, disableAntoraSupport, enableAntoraSupport, removeFiles } from './workspaceHelper'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri (resource: vscode.Uri): vscode.Uri {
    return vscode.Uri.file(resource.path)
  }

  asMediaWebViewSrc (...pathSegments: string[]): string {
    return pathSegments.toString()
  }

  cspSource = 'cspSource'
}

class EmptyAsciidocContributions implements AsciidocContributions {
  readonly previewScripts = []
  readonly previewStyles = []
  readonly previewResourceRoots = []
}

class AsciidocContributionProviderTest implements AsciidocContributionProvider {
  readonly extensionUri

  constructor (extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri
  }

  onContributionsChanged: vscode.Event<this>

  readonly contributions = new EmptyAsciidocContributions()

  dispose () {
    // noop
  }
}

suite('AsciiDoc parser with Antora support enabled', function () {
  this.timeout(60000)
  test('convert Antora page', async () => {
    const createdFiles = []
    try {
      createdFiles.push(await createDirectory('docs'))
      await createFile(`name: "antora"
version: "1.1.1"
title: Antora
asciidoc:
  attributes:
    url-vscode-marketplace: https://marketplace.visualstudio.com/vscode
`, 'docs', 'antora.yml')
      const asciidocFile = await createFile('', 'docs', 'modules', 'ROOT', 'pages', 'index.adoc') // virtual
      await enableAntoraSupport()
      const asciidocParser = new AsciidocEngine(
        new AsciidocContributionProviderTest(extensionContext.extensionUri),
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
        new AsciidoctorDiagnostic('test')
      )
      const result = await asciidocParser.convertFromTextDocument(
        new InMemoryDocument(
          asciidocFile,
          'Download from the {url-vscode-marketplace}[Visual Studio Code Marketplace].'
        ),
        extensionContext,
        new TestWebviewResourceProvider()
      )
      assert.strictEqual(result.html.includes('<p>Download from the <a href="https://marketplace.visualstudio.com/vscode" data-href="https://marketplace.visualstudio.com/vscode">Visual Studio Code Marketplace</a>.</p>'), true)
    } finally {
      await removeFiles(createdFiles)
      await disableAntoraSupport()
    }
  })
})
