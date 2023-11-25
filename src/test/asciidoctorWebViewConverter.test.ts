import vscode from 'vscode'
import { AsciidoctorWebViewConverter } from '../asciidoctorWebViewConverter'
import { WebviewResourceProvider } from '../util/resources'
import { AsciidocPreviewConfigurationManager } from '../features/previewConfig'
import { AsciidocContributions } from '../asciidocExtensions'
import assert from 'assert'
import sinon from 'sinon'
import { AntoraDocumentContext } from '../features/antora/antoraSupport'
import { getDefaultWorkspaceFolderUri } from '../util/workspace'
import { createDirectory, createFile, removeFiles } from './workspaceHelper'

const asciidoctor = require('@asciidoctor/core')
const processor = asciidoctor()

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri (resource: vscode.Uri): vscode.Uri {
    return resource
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

function createAntoraDocumentContextStub (resourcePath: string | undefined) {
  const antoraDocumentContextStub = sinon.createStubInstance(AntoraDocumentContext)
  antoraDocumentContextStub.resolveAntoraResourceIds.returns(resourcePath)
  return antoraDocumentContextStub
}

async function testAsciidoctorWebViewConverter (
  input: string,
  antoraDocumentContext: AntoraDocumentContext | undefined,
  expected: string,
  root: vscode.Uri,
  pathSegments: string[]
) {
  const file = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, ...pathSegments))
  const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
    file,
    new TestWebviewResourceProvider(),
    2,
    false,
    new TestAsciidocContributions(),
    new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(file.uri),
    antoraDocumentContext,
    undefined
  )
  const html = processor.convert(input, { converter: asciidoctorWebViewConverter })
  assert.strictEqual(html, expected)
}

suite('AsciidoctorWebViewConverter', async () => {
  const createdFiles: vscode.Uri[] = []
  suiteSetup(async () => {
    createdFiles.push(await createDirectory('images'))
    await createFile('', 'images', 'ocean', 'waves', 'seaswell.png')
    await createFile('', 'images', 'mountain.jpeg')
    createdFiles.push(await createFile('', 'help.adoc'))
    const asciidocFile = await createFile(`image::images/ocean/waves/seaswell.png[]

image::images/mountain.jpeg[]

link:help.adoc[]
`, 'asciidoctorWebViewConverterTest.adoc')
    createdFiles.push(await createDirectory('docs'))
    await createFile('', 'docs', 'modules', 'ROOT', 'pages', 'dummy.adoc') // virtual file
    createdFiles.push(asciidocFile)
  })
  suiteTeardown(async () => {
    await removeFiles(createdFiles)
  })

  const workspaceUri = getDefaultWorkspaceFolderUri()
  // WIP need to find more interesting test cases
  const testCases = [
    // images
    {
      title: 'Unresolved image resource id from Antora (fallback to base converter)',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'image::1.0@wyoming:sierra-madre:panorama.png[]',
      antoraDocumentContext: createAntoraDocumentContextStub(undefined),
      expected: `<div class="imageblock">
<div class="content">
<img src="1.0@wyoming:sierra-madre:panorama.png" alt="1.0@wyoming:sierra madre:panorama">
</div>
</div>`,
    },
    {
      title: 'Should resolve image src with Antora id\'s input and Antora support activated',
      filePath: ['docs', 'modules', 'ROOT', 'pages', 'dummy.adoc'],
      input: 'image::2.0@cli:commands:seaswell.png[]',
      antoraDocumentContext: createAntoraDocumentContextStub(`${workspaceUri.path}/antora/multiComponents/cli/modules/commands/images/seaswell.png`),
      expected: `<div class="imageblock">
<div class="content">
<img src="${workspaceUri.path}/antora/multiComponents/cli/modules/commands/images/seaswell.png" alt="seaswell">
</div>
</div>`,
    },
    // links
    {
      title: 'Should resolve macro link',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'link:full.adoc[]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="full.adoc" class="bare" data-href="full.adoc">full.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve macro link with roles',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'link:full.adoc[role="action button"]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="full.adoc" class="bare action button" data-href="full.adoc">full.adoc</a></p>
</div>`,
    },
  ]

  for (const testCase of testCases) {
    test(testCase.title, async () => testAsciidoctorWebViewConverter(testCase.input, testCase.antoraDocumentContext, testCase.expected, workspaceUri, testCase.filePath))
  }
})
