/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { AsciidocParser } from '../asciidocParser'
import { AsciidocContributionProvider, AsciidocContributions } from '../asciidocExtensions'
import { AsciidocPreview } from '../features/preview'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'

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

suite('asciidoc.Asciidoctorconfig', () => {
  let extensionContext: vscode.ExtensionContext
  suiteSetup(async () => {
    // Trigger extension activation and grab the context as some tests depend on it
    await vscode.extensions.getExtension('vscode.vscode-api-tests')?.activate()
    extensionContext = (global as any).testExtensionContext
  })

  test('Pick up config from root workspace folder', async () => {
    const webview = vscode.window.createWebviewPanel(
      AsciidocPreview.viewType,
      'Test',
      vscode.ViewColumn.One
    )
    try {
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath
      const file = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/attributes.adoc`))
      // eslint-disable-next-line max-len
      const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
      const { html } = await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)
      assert.strictEqual(html.includes('<h1>Asciidoctor VS Code Extension</h1>'), true, '{application-name} should be substituted by the value defined in .asciidoctorconfig')
    } finally {
      webview.dispose()
    }
  })
})
