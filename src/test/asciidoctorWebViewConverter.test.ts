import vscode from 'vscode'
import { AsciidoctorWebViewConverter } from '../asciidoctorWebViewConverter'
import { WebviewResourceProvider } from '../util/resources'
import { AsciidocPreviewConfigurationManager } from '../features/previewConfig'
import { AsciidocContributions } from '../asciidocExtensions'
import assert from 'assert'
import { getAntoraDocumentContext } from '../features/antora/antoraSupport'

const asciidoctor = require('@asciidoctor/core')
const processor = asciidoctor()

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri (resource: vscode.Uri): vscode.Uri {
    return vscode.Uri.file(resource.path)
  }

  asMediaWebViewSrc (...pathSegments: string[]): string {
    return pathSegments.toString()
  }

  cspSource = 'aaaa'
}

class TestAsciidocContributions implements AsciidocContributions {
  readonly previewResourceRoots: ReadonlyArray<vscode.Uri> = []
  readonly previewScripts: ReadonlyArray<vscode.Uri> = []
  readonly previewStyles: ReadonlyArray<vscode.Uri> = []
}

async function testAsciidoctorWebViewConverter (input, expected, root, filePath, extensionContext) {
  const file = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/${filePath}`))
  const webviewResourceProvider = new TestWebviewResourceProvider()
  const cspArbitergetSecurityLevelForResource = 2
  const cspArbiterShouldDisableSecurityWarnings = false
  const contributions = new TestAsciidocContributions()
  const previewConfigurations = new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(file.uri)
  const antoraDocumentContext = await getAntoraDocumentContext(file.uri, extensionContext.workspaceState)
  const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
    file,
    webviewResourceProvider,
    cspArbitergetSecurityLevelForResource,
    cspArbiterShouldDisableSecurityWarnings,
    contributions,
    previewConfigurations,
    antoraDocumentContext,
    undefined
  )
  const html = processor.convert(input, { converter: asciidoctorWebViewConverter })
  assert.strictEqual(html, expected)
}

suite('AsciidoctorWebViewConverter', async () => {
  let extensionContext: vscode.ExtensionContext
  suiteSetup(async () => {
    // Trigger extension activation and grab the context as some tests depend on it
    await vscode.extensions.getExtension('vscode.vscode-api-tests')?.activate()
    extensionContext = (global as any).testExtensionContext
  })

  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  // WIP need to find more interesting test cases
  const testCases = [
    // images
    {
      title: 'Should resolve image src',
      filePath: 'asciidoctorWebViewConverterTest.adoc',
      input: 'image::images/web-console.png[Couchbase Web Console login]',
      expected: `<div class="imageblock">
<div class="content">
<img src="images/web-console.png" alt="Couchbase Web Console login">
</div>
</div>`,
    },
    /*    {
      title: 'Should resolve image src with Antora id\'s input and Antora support activated',
      filePath: 'antora/multiComponents/cli/modules/commands/pages/page1.adoc',
      input: 'image::2.0@cli:commands:seaswell.png[]',
      expected: `<div class="imageblock">
<div class="content">
<img src="${root}/antora/multiComponents/cli/modules/commands/images/seaswell.png" alt="seaswell">
</div>
</div>`,
    },*/
    // links
    {
      title: 'Should resolve macro link',
      filePath: 'asciidoctorWebViewConverterTest.adoc',
      input: 'link:full.adoc[]',
      expected: `<div class="paragraph">
<p><a href="full.adoc" class="undefined" data-href="full.adoc">full.adoc</a></p>
</div>`,
    },
  ]

  for (const testCase of testCases) {
    test(testCase.title, async () => testAsciidoctorWebViewConverter(testCase.input, testCase.expected, root, testCase.filePath, extensionContext))
  }
})
