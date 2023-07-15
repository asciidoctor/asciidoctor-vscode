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
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  test('convert Antora page', async () => {
    await extensionContext.workspaceState.update('antoraSupportSetting', true)
    await vscode.workspace.getConfiguration('asciidoc', null).update('antora.enableAntoraSupport', true)
    const asciidocParser = new AsciidocEngine(
      new AsciidocContributionProviderTest(extensionContext.extensionUri),
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
      new AsciidoctorDiagnostic('test')
    )
    const result = await asciidocParser.convertFromTextDocument(
      new InMemoryDocument(
        vscode.Uri.file(`${root}/antora/multiComponents/api/modules/auth/pages/page.adoc`),
        'Download from the {url-vscode-marketplace}[Visual Studio Code Marketplace].'
      ),
      extensionContext,
      new TestWebviewResourceProvider()
    )
    assert.strictEqual(result.html.includes('<p>Download from the <a href="https://marketplace.visualstudio.com/vscode" data-href="https://marketplace.visualstudio.com/vscode">Visual Studio Code Marketplace</a>.</p>'), true)
  })
})
