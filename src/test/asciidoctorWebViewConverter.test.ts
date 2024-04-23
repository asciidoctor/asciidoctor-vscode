import vscode from 'vscode'
import path from 'path'
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

function createConverterOptions (converter: AsciidoctorWebViewConverter, fileName: string) {

  // treat the file as the source file for conversion to handle xref correctly between documents
  // review src/asciidocEngin.ts for more information
  const intrinsicAttr = {
    'docdir': path.dirname(fileName),
    'docfile': fileName,
    'docfilesuffix': path.extname(fileName).substring(1),
    'docname': path.basename(fileName, path.extname(fileName)),
    'filetype': converter.outfilesuffix.substring(1)
  }

  return {
    converter,
    attributes: {
      ...intrinsicAttr,

      // required for navigation between source files in preview
      // see: https://docs.asciidoctor.org/asciidoc/latest/macros/inter-document-xref/#navigating-between-source-files
      relfilesuffix: '.adoc'
    },
    safe: 'unsafe' // needed so that we can actually perform includes, enabling xref tests
  }
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

  const html = processor.convert(input, createConverterOptions(asciidoctorWebViewConverter, file.fileName))
  assert.strictEqual(html, expected)
}

async function testAsciidoctorWebViewConverterStandalone (
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
  const html = processor.convert(input, {
    ...createConverterOptions(asciidoctorWebViewConverter, file.fileName),
    standalone: true
  })
  html.includes(expected)
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

    // these help with testing xref cross documents
    createdFiles.push(await createFile(`= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]`, 'docA.adoc'))
    createdFiles.push(await createFile(`= Child document

[#other_anchor]
== Other link to here

Other text

I want to link to xref:docA.adoc#anchor[]`, 'docB.adoc'))
    createdFiles.push(await createFile(`= Child document

third text

I want to link to xref:docB.adoc#other_anchor[]`, 'docC.adoc'))
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
    // xref
    {
      title: 'Should resolve "xref:" macro from included document referencing the source document',
      filePath: ['docA.adoc'],
      input: `= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<a href="#anchor" data-href="#anchor">Link to here</a>`,
      standalone: true
    },
    {
      title: 'Should resolve "xref:" macro from included document referencing a separate included document',
      filePath: ['docA.adoc'],
      input: `= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]

include::docC.adoc[]`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<a href="#other_anchor" data-href="#other_anchor">Other link to here</a>`,
      standalone: true
    },
    {
      title: 'Should resolve "xref:" macro to document',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="other.adoc" data-href="other.adoc">other.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to document - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[Other document]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="other.adoc" data-href="other.adoc">Other document</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to document - with roles',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[role="foo"]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="other.adoc" class="foo" data-href="other.adoc">other.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_text_test[]

= Text test`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#_text_test" data-href="#_text_test">Text test</a></p>
</div>
<h1 id="_text_test" class="sect0">Text test</h1>
`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_text_test[Explicit text]

= Text test`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#_text_test" data-href="#_text_test">Explicit text</a></p>
</div>
<h1 id="_text_test" class="sect0">Text test</h1>
`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference - with reftext',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_reftext_test[]

[reftext="Test reftext"]
= Reftext Test`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#_reftext_test" data-href="#_reftext_test">Test reftext</a></p>
</div>
<h1 id="_reftext_test" class="sect0">Reftext Test</h1>
`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference - with reftext and explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_reftext_test[Explicit text]

[reftext="Test reftext"]
= Reftext Test`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#_reftext_test" data-href="#_reftext_test">Explicit text</a></p>
</div>
<h1 id="_reftext_test" class="sect0">Reftext Test</h1>
`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference - without matching anchor',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:_non_existing_ref_test[]',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#_non_existing_ref_test" data-href="#_non_existing_ref_test">_non_existing_ref_test</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to inline anchor - without text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `<<inline_anchor_without_text>>

[[inline_anchor_without_text]]Some text`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#inline_anchor_without_text" data-href="#inline_anchor_without_text">inline_anchor_without_text</a></p>
</div>
<div class="paragraph">
<p><a id="inline_anchor_without_text"></a>Some text</p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to inline anchor - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `<<inline_anchor_with_explicit_text>>

[[inline_anchor_with_explicit_text,Explicit text]]Some text`,
      antoraDocumentContext: undefined, // Antora not enabled
      expected: `<div class="paragraph">
<p><a href="#inline_anchor_with_explicit_text" data-href="#inline_anchor_with_explicit_text">Explicit text</a></p>
</div>
<div class="paragraph">
<p><a id="inline_anchor_with_explicit_text"></a>Some text</p>
</div>`,
    },
    {
      title: 'Should not add role doc to content when no Antora context is provided',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: '= Test Document',
      antoraDocumentContext: undefined, // Antora not enabled
      expected: '<div id="content">',
      standalone: true,
    },
    {
      title: 'Add role doc to content when Antora context is provided',
      filePath: ['docs', 'modules', 'ROOT', 'pages', 'dummy.adoc'],
      input: '= Test Document',
      antoraDocumentContext: createAntoraDocumentContextStub(undefined),
      expected: '<div id="content" class="doc">',
      standalone: true,
    },

  ]

  for (const testCase of testCases) {
    if (testCase.standalone) {
      test(testCase.title, async () => testAsciidoctorWebViewConverterStandalone(
        testCase.input, testCase.antoraDocumentContext, testCase.expected, workspaceUri, testCase.filePath
      ))
    } else {
      test(testCase.title, async () => testAsciidoctorWebViewConverter(testCase.input, testCase.antoraDocumentContext, testCase.expected, workspaceUri, testCase.filePath))
    }
  }
})
