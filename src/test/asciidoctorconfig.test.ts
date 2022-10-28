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

  const configFileNames = ['.asciidoctorconfig', '.asciidoctorconfig.adoc']
  configFileNames.forEach((configFileName) => {
    test(`Pick up ${configFileName} from root workspace folder`, async () => {
      const webview = vscode.window.createWebviewPanel(
        AsciidocPreview.viewType,
        'Test',
        vscode.ViewColumn.One
      )
      let configFile: vscode.Uri
      try {
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath
        configFile = vscode.Uri.file(`${root}/${configFileName}`)
        await vscode.workspace.fs.writeFile(configFile, Buffer.from(':application-name: Asciidoctor VS Code Extension'))
        const file = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/attributes.adoc`))
        // eslint-disable-next-line max-len
        const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
        const { html } = await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)
        assert.strictEqual(html.includes('<h1>Asciidoctor VS Code Extension</h1>'), true, `{application-name} should be substituted by the value defined in ${configFileName}`)
      } finally {
        webview.dispose()
        if (configFile !== undefined) {
          await vscode.workspace.fs.delete(configFile)
        }
      }
    })
  })

  suite('Pick up .asciidoctorconfig and .asciidoctorconfig.adoc from root workspace folder', async () => {
    let html: string
    let webview: vscode.WebviewPanel
    const createdFiles: vscode.Uri[] = []

    suiteSetup(async () => {
      console.log('starting setup of second test suite')
      webview = vscode.window.createWebviewPanel(
        AsciidocPreview.viewType,
        'Test',
        vscode.ViewColumn.One
      )
      const root = vscode.workspace.workspaceFolders[0].uri.fsPath

      createdFiles.push(await createFileWithContentAtWorkspaceRoot(root, '.asciidoctorconfig',
        `:var-only-in-asciidoctorconfig: From .asciidoctorconfig
:var-in-both: var-in-both value from .asciidoctorconfig`))
      createdFiles.push(await createFileWithContentAtWorkspaceRoot(root, '.asciidoctorconfig.adoc',
        `:var-only-in-asciidoctorconfig-adoc: From .asciidoctorconfig.adoc
:var-in-both: var-in-both value from .asciidoctorconfig.adoc`))

      const adocForTest = await createFileWithContentAtWorkspaceRoot(root, 'test-pickup-both-asciidoctorconfig-at-workspace-root.adoc',
        `{var-in-both}

{var-only-in-asciidoctorconfig-adoc}

{var-only-in-asciidoctorconfig}`)
      createdFiles.push(adocForTest)
      const file = await vscode.workspace.openTextDocument(adocForTest)
      // eslint-disable-next-line max-len
      const asciidocParser = new AsciidocParser(new AsciidocContributionProviderTest(extensionContext.extensionUri), new AsciidoctorExtensionsSecurityPolicyArbiter(extensionContext))
      html = (await asciidocParser.convertUsingJavascript(file.getText(), file, extensionContext, webview)).html
      console.log(html)
    })

    suiteTeardown(async () => {
      webview.dispose()
      for (const createdFile of createdFiles) {
        await vscode.workspace.fs.delete(createdFile)
      }
    })

    test('Var from .asciidocforconfig is used', async () => {
      assert.strictEqual(html.includes('<p>From .asciidoctorconfig</p>'), true, '{var-only-in-asciidoctorconfig} should be substituted by the value defined in .asciidoctorconfig')
    })

    test('Var from .asciidocforconfig.adoc is used', async () => {
      assert.strictEqual(html.includes('<p>From .asciidoctorconfig.adoc</p>'), true, '{var-only-in-asciidoctorconfig.adoc} should be substituted by the value defined in .asciidoctorconfig.adoc')
    })

    test('Var from .asciidocforconfig.adoc has precedence on .asciidoctorconfig.adoc', async () => {
      assert.strictEqual(html.includes('<p>var-in-both value from .asciidoctorconfig.adoc</p>'), true, '{var-in-both} should be substituted by the value defined in .asciidoctorconfig.adoc')
    })

    async function createFileWithContentAtWorkspaceRoot (root: string, configFileName: string, fileContent: string) {
      const configFile = vscode.Uri.file(`${root}/${configFileName}`)
      await vscode.workspace.fs.writeFile(configFile, Buffer.from(fileContent))
      return configFile
    }
  })
})
