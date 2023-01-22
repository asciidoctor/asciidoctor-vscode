import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { AsciidocParser } from '../asciidocParser'
import { AsciidocContributionProvider, AsciidocContributions } from '../asciidocExtensions'
import { Range } from 'vscode'
import { WebviewResourceProvider } from '../util/resources'
import { extensionContext } from './helper'

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
    const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri))
    const result = await asciidocParser.convertUsingJavascript('Download from the {url-vscode-marketplace}[Visual Studio Code Marketplace].', {
      uri: vscode.Uri.file(`${root}/antora/multiComponents/api/modules/auth/pages/page.adoc`),
      fileName: 'page.adoc',
      lineCount: 1,
      getText (): string {
        return ''
      },
      lineAt (line: number): vscode.TextLine {
        return {
          lineNumber: line,
          text: 'string',
          range: new Range(0, 0, 0, 0),
          rangeIncludingLineBreak: new Range(0, 0, 0, 0),
          firstNonWhitespaceCharacterIndex: 0,
          isEmptyOrWhitespace: false,
        }
      },
    },
    extensionContext, new TestWebviewResourceProvider())
    assert.strictEqual(result.html.includes('<p>Download from the <a href="https://marketplace.visualstudio.com/vscode" data-href="https://marketplace.visualstudio.com/vscode">Visual Studio Code Marketplace</a>.</p>'), true)
  })
})
