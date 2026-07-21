import assert from 'node:assert/strict'
import * as path from 'node:path'
import { after, before, describe, test } from 'node:test'
import {
  AbstractBlock,
  convert as asciidoctorConvert,
  load as asciidoctorLoad,
  Extensions,
} from '@asciidoctor/core'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../core/resources.js'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import { AntoraDocumentContext } from '../features/antora/antoraContext.js'
import { AsciidocContributions } from '../features/extensionContributions.js'
import { AsciidoctorWebViewConverter } from '../features/preview/asciidoctorWebViewConverter.js'
import { mermaidJSProcessor } from '../features/preview/mermaid.js'
import {
  AsciidocPreviewConfigurationManager,
  type AsciidocPreviewDefaultStyle,
} from '../features/preview/previewConfig.js'
import { createDirectory, createFile, removeFiles } from './workspaceHelper.js'

class TestWebviewResourceProvider implements WebviewResourceProvider {
  asWebviewUri(resource: vscode.Uri): vscode.Uri {
    return resource
  }

  asMediaWebViewSrc(...pathSegments: string[]): string {
    return pathSegments.toString()
  }

  cspSource = 'aaaa'
}

class TestAsciidocContributions implements AsciidocContributions {
  readonly previewResourceRoots: ReadonlyArray<vscode.Uri> = []
  readonly previewScripts: ReadonlyArray<vscode.Uri> = []
  readonly previewStyles: ReadonlyArray<vscode.Uri> = []
}

function createAntoraDocumentContextStub(resourcePath: string | undefined) {
  const antoraDocumentContextStub = sinon.createStubInstance(
    AntoraDocumentContext,
  )
  antoraDocumentContextStub.resolveAntoraResourceIds.returns(resourcePath)
  return antoraDocumentContextStub
}

function createConverterOptions(
  converter: AsciidoctorWebViewConverter,
  fileName: string,
) {
  const intrinsicAttr = {
    docdir: path.dirname(fileName),
    docfile: fileName,
    docfilesuffix: path.extname(fileName).substring(1),
    docname: path.basename(fileName, path.extname(fileName)),
    filetype: converter.outfilesuffix.substring(1),
  }

  return {
    converter,
    attributes: {
      ...intrinsicAttr,
      relfilesuffix: '.adoc',
    },
    safe: 'unsafe',
  }
}

async function testAsciidoctorWebViewConverter(
  input: string,
  antoraDocumentContext: AntoraDocumentContext | undefined,
  expected: string,
  root: vscode.Uri,
  pathSegments: string[],
) {
  const file = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(root, ...pathSegments),
  )
  const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
    file,
    new TestWebviewResourceProvider(),
    2,
    false,
    new TestAsciidocContributions(),
    new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(
      file.uri,
    ),
    antoraDocumentContext,
    undefined,
  )

  const html = await asciidoctorConvert(
    input,
    createConverterOptions(asciidoctorWebViewConverter, file.fileName),
  )
  assert.strictEqual(html, expected)
}

async function testAsciidoctorWebViewConverterStandalone(
  input: string,
  antoraDocumentContext: AntoraDocumentContext | undefined,
  expected: string,
  root: vscode.Uri,
  pathSegments: string[],
) {
  const file = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(root, ...pathSegments),
  )
  const asciidoctorWebViewConverter = new AsciidoctorWebViewConverter(
    file,
    new TestWebviewResourceProvider(),
    2,
    false,
    new TestAsciidocContributions(),
    new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(
      file.uri,
    ),
    antoraDocumentContext,
    undefined,
  )
  const html = await asciidoctorConvert(input, {
    ...createConverterOptions(asciidoctorWebViewConverter, file.fileName),
    standalone: true,
  })
  if (html instanceof String) {
    html.includes(expected)
  }
}

describe('AsciidoctorWebViewConverter', async () => {
  const createdFiles: vscode.Uri[] = []
  before(async () => {
    createdFiles.push(await createDirectory('images'))
    await createFile('', 'images', 'ocean', 'waves', 'seaswell.png')
    await createFile('', 'images', 'mountain.jpeg')
    createdFiles.push(await createFile('', 'help.adoc'))
    const asciidocFile = await createFile(
      `image::images/ocean/waves/seaswell.png[]

image::images/mountain.jpeg[]

link:help.adoc[]
`,
      'asciidoctorWebViewConverterTest.adoc',
    )
    createdFiles.push(await createDirectory('docs'))
    await createFile('', 'docs', 'modules', 'ROOT', 'pages', 'dummy.adoc')
    createdFiles.push(asciidocFile)

    createdFiles.push(
      await createFile(
        `= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]`,
        'docA.adoc',
      ),
    )
    createdFiles.push(
      await createFile(
        `= Child document

[#other_anchor]
== Other link to here

Other text

I want to link to xref:docA.adoc#anchor[]`,
        'docB.adoc',
      ),
    )
    createdFiles.push(
      await createFile(
        `= Child document

third text

I want to link to xref:docB.adoc#other_anchor[]`,
        'docC.adoc',
      ),
    )
  })
  after(async () => {
    await removeFiles(createdFiles)
  })

  const workspaceUri = getDefaultWorkspaceFolderUri()
  const testCases = [
    {
      title:
        'Unresolved image resource id from Antora (fallback to base converter)',
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
      title:
        "Should resolve image src with Antora id's input and Antora support activated",
      filePath: ['docs', 'modules', 'ROOT', 'pages', 'dummy.adoc'],
      input: 'image::2.0@cli:commands:seaswell.png[]',
      antoraDocumentContext: createAntoraDocumentContextStub(
        `${workspaceUri.path}/antora/multiComponents/cli/modules/commands/images/seaswell.png`,
      ),
      expected: `<div class="imageblock">
<div class="content">
<img src="${workspaceUri.path}/antora/multiComponents/cli/modules/commands/images/seaswell.png" alt="seaswell">
</div>
</div>`,
    },
    {
      title: 'Should resolve macro link',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'link:full.adoc[]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="full.adoc" class="bare" data-href="full.adoc">full.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve macro link with roles',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'link:full.adoc[role="action button"]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="full.adoc" class="bare action button" data-href="full.adoc">full.adoc</a></p>
</div>`,
    },
    {
      // #645: the link role must render as the element's class. Regression guard
      // for the `node.role` (always undefined in JS) → `node.getRole()` fix; the
      // old code emitted `class="undefined"`.
      title: 'Should render a macro link role as a class (#645)',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'link:foo.adoc[role=bar]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="foo.adoc" class="bare bar" data-href="foo.adoc">foo.adoc</a></p>
</div>`,
    },
    {
      title:
        'Should resolve "xref:" macro from included document referencing the source document',
      filePath: ['docA.adoc'],
      input: `= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]`,
      antoraDocumentContext: undefined,
      expected: '<a href="#anchor" data-href="#anchor">Link to here</a>',
      standalone: true,
    },
    {
      title:
        'Should resolve "xref:" macro from included document referencing a separate included document',
      filePath: ['docA.adoc'],
      input: `= Parent document

Some text

[#anchor]
== Link to here

Please scroll me into position

include::docB.adoc[]

include::docC.adoc[]`,
      antoraDocumentContext: undefined,
      expected:
        '<a href="#other_anchor" data-href="#other_anchor">Other link to here</a>',
      standalone: true,
    },
    {
      title: 'Should resolve "xref:" macro to document',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="other.adoc" data-href="other.adoc">other.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to document - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[Other document]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="other.adoc" data-href="other.adoc">Other document</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to document - with roles',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:other.adoc[role="foo"]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="other.adoc" class="foo" data-href="other.adoc">other.adoc</a></p>
</div>`,
    },
    {
      title:
        'Should resolve "xref:" Antora resource id to the referenced page and anchor',
      filePath: ['docs', 'modules', 'ROOT', 'pages', 'dummy.adoc'],
      input: 'xref:api:auth:page3.adoc#oauth[]',
      antoraDocumentContext: createAntoraDocumentContextStub(
        `${workspaceUri.path}/antora/multiComponents/api/modules/auth/pages/page3.adoc`,
      ),
      expected: `<div class="paragraph">
<p><a href="${workspaceUri.path}/antora/multiComponents/api/modules/auth/pages/page3.adoc#oauth" data-href="${workspaceUri.path}/antora/multiComponents/api/modules/auth/pages/page3.adoc#oauth">api:auth:page3.adoc</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro for internal cross reference',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_text_test[]

= Text test`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#_text_test" data-href="#_text_test">Text test</a></p>
</div>
<h1 id="_text_test" class="sect0">Text test</h1>
`,
    },
    {
      title:
        'Should resolve "xref:" macro for internal cross reference - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_text_test[Explicit text]

= Text test`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#_text_test" data-href="#_text_test">Explicit text</a></p>
</div>
<h1 id="_text_test" class="sect0">Text test</h1>
`,
    },
    {
      title:
        'Should resolve "xref:" macro for internal cross reference - with reftext',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_reftext_test[]

[reftext="Test reftext"]
= Reftext Test`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#_reftext_test" data-href="#_reftext_test">Test reftext</a></p>
</div>
<h1 id="_reftext_test" class="sect0">Reftext Test</h1>
`,
    },
    {
      title:
        'Should resolve "xref:" macro for internal cross reference - with reftext and explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `xref:_reftext_test[Explicit text]

[reftext="Test reftext"]
= Reftext Test`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#_reftext_test" data-href="#_reftext_test">Explicit text</a></p>
</div>
<h1 id="_reftext_test" class="sect0">Reftext Test</h1>
`,
    },
    {
      title:
        'Should resolve "xref:" macro for internal cross reference - without matching anchor',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: 'xref:_non_existing_ref_test[]',
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#_non_existing_ref_test" data-href="#_non_existing_ref_test">_non_existing_ref_test</a></p>
</div>`,
    },
    {
      title: 'Should resolve "xref:" macro to inline anchor - without text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `<<inline_anchor_without_text>>

[[inline_anchor_without_text]]Some text`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#inline_anchor_without_text" data-href="#inline_anchor_without_text">inline_anchor_without_text</a></p>
</div>
<div class="paragraph">
<p><a id="inline_anchor_without_text"></a>Some text</p>
</div>`,
    },
    {
      title:
        'Should resolve "xref:" macro to inline anchor - with explicit text',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `<<inline_anchor_with_explicit_text>>

[[inline_anchor_with_explicit_text,Explicit text]]Some text`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p><a href="#inline_anchor_with_explicit_text" data-href="#inline_anchor_with_explicit_text">Explicit text</a></p>
</div>
<div class="paragraph">
<p><a id="inline_anchor_with_explicit_text"></a>Some text</p>
</div>`,
    },
    {
      title:
        'Should not add role doc to content when no Antora context is provided',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: '= Test Document',
      antoraDocumentContext: undefined,
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
    {
      title: 'Should honor xrefstyle',
      filePath: ['asciidoctorWebViewConverterTest.adoc'],
      input: `= Document Title
:xrefstyle: short

See <<my-table>> for more reference.

See xref:my-table[xrefstyle=short] for more reference.

.Title of my table
[#my-table]
|===
|data
|===`,
      antoraDocumentContext: undefined,
      expected: `<div class="paragraph">
<p>See <a href="#my-table" data-href="#my-table">Table 1</a> for more reference.</p>
</div>
<div class="paragraph">
<p>See <a href="#my-table" data-href="#my-table">Table 1</a> for more reference.</p>
</div>
<table id="my-table" class="tableblock frame-all grid-all stretch">
<caption class="title">Table 1. Title of my table</caption>
<colgroup>
<col width="100%">
</colgroup>
<tbody>
<tr>
<td class="tableblock halign-left valign-top"><p class="tableblock">data</p></td>
</tr>
</tbody>
</table>`,
    },
  ]

  async function convertWithDataUri(input: string): Promise<string> {
    const file = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceUri, 'asciidoctorWebViewConverterTest.adoc'),
    )
    const converter = new AsciidoctorWebViewConverter(
      file,
      new TestWebviewResourceProvider(),
      2,
      false,
      new TestAsciidocContributions(),
      new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(
        file.uri,
      ),
      undefined,
      undefined,
      null,
      undefined,
      true, // dataUriEnabled
    )
    return (await asciidoctorConvert(
      input,
      createConverterOptions(converter, file.fileName),
    )) as unknown as string
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

  test('Should embed a local SVG as a data-uri when data-uri is enabled', async () => {
    createdFiles.push(await createFile(svg, 'data-uri-local.svg'))
    const html = await convertWithDataUri('image::data-uri-local.svg[]')
    assert.ok(
      html.includes(`<img src="${svgDataUri}"`),
      `expected embedded data-uri in:\n${html}`,
    )
  })

  test('Should resolve the image against the imagesdir in effect at the image', async () => {
    createdFiles.push(await createDirectory('data-uri-assets'))
    createdFiles.push(await createFile(svg, 'data-uri-assets', 'in-dir.svg'))
    // `:imagesdir:` is read from the image node (position-aware), so the file is
    // resolved under data-uri-assets/ even though it is set in the document body.
    const html = await convertWithDataUri(
      ':imagesdir: data-uri-assets\n\nimage::in-dir.svg[]',
    )
    assert.ok(
      html.includes(`<img src="${svgDataUri}"`),
      `expected imagesdir-resolved data-uri in:\n${html}`,
    )
  })

  // #705: an interdocument link with a `#fragment` is followed in the preview by
  // re-rendering the target document with that fragment, which the webview reads
  // from `data-settings` to scroll to the anchor. These tests check the fragment
  // makes it into the rendered `data-settings` (and is absent otherwise).
  function readDataSettings(html: string): { [key: string]: any } {
    const match = html.match(/data-settings="([^"]*)"/)
    assert.ok(match, `no data-settings found in:\n${html}`)
    return JSON.parse(match[1].replace(/&quot;/g, '"'))
  }

  async function convertStandaloneWithFragment(
    input: string,
    fragment: string | undefined,
    defaultStyle?: AsciidocPreviewDefaultStyle,
    antoraDocumentContext?: AntoraDocumentContext,
  ): Promise<string> {
    const file = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceUri, 'asciidoctorWebViewConverterTest.adoc'),
    )
    const config =
      new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(
        file.uri,
      )
    if (defaultStyle !== undefined) {
      const testConfig = config as unknown as {
        defaultStyle: AsciidocPreviewDefaultStyle
        defaultStyleExplicit: boolean
      }
      testConfig.defaultStyle = defaultStyle
      testConfig.defaultStyleExplicit = true
    }
    const converter = new AsciidoctorWebViewConverter(
      file,
      new TestWebviewResourceProvider(),
      2,
      false,
      new TestAsciidocContributions(),
      config,
      antoraDocumentContext,
      undefined, // line
      null, // state
      undefined, // krokiServerUrl
      false, // dataUriEnabled
      fragment,
    )
    return (await asciidoctorConvert(input, {
      ...createConverterOptions(converter, file.fileName),
      standalone: true,
    })) as unknown as string
  }

  test('Should carry the scroll-to fragment into data-settings', async () => {
    const html = await convertStandaloneWithFragment(
      'Some content',
      'inline-anchor-paragraph',
    )
    assert.strictEqual(
      readDataSettings(html).fragment,
      'inline-anchor-paragraph',
    )
  })

  test('Should not set a fragment in data-settings when none is given', async () => {
    const html = await convertStandaloneWithFragment('Some content', undefined)
    assert.strictEqual(readDataSettings(html).fragment, undefined)
  })

  // A passthrough block (here a [mermaid] diagram) is emitted verbatim by the
  // base converter, which dropped the `data-line-*`/`data-h-*` roles the engine
  // attaches to every source block. Without them the incremental preview update
  // could neither anchor the diagram to a source line nor detect it as
  // unchanged, so every edit reverted the rendered diagram back to raw source
  // until a click forced a full refresh. The converter now wraps passthrough
  // content in an element carrying those roles.
  test('Should preserve data-line/data-h roles around a passthrough (Mermaid) block', async () => {
    const file = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(workspaceUri, 'asciidoctorWebViewConverterTest.adoc'),
    )
    const converter = new AsciidoctorWebViewConverter(
      file,
      new TestWebviewResourceProvider(),
      2,
      false,
      new TestAsciidocContributions(),
      new AsciidocPreviewConfigurationManager().loadAndCacheConfiguration(
        file.uri,
      ),
      undefined,
      undefined,
    )
    const registry = Extensions.create()
    registry.block('mermaid', mermaidJSProcessor())
    // Typed loosely, like the engine does (asciidocEngine.ts), because the
    // `@asciidoctor/core` typings only describe a handful of the options `load`
    // and `convert` actually accept.
    const options: { [key: string]: any } = {
      ...createConverterOptions(converter, file.fileName),
      sourcemap: true,
      extension_registry: registry,
    }
    const doc = await asciidoctorLoad(
      '[mermaid]\n----\ngraph TD\n  A --> B\n----',
      options,
    )
    // Replicate the per-block source-line / content-hash roles the engine adds
    // (see asciidocEngine.ts) so the converter sees the same input as in a real
    // preview render.
    doc
      .findBy((b: AbstractBlock) => typeof b.getLineNumber() !== 'undefined')
      .forEach((b) => {
        b.addRole('data-line-' + b.getLineNumber())
        b.addRole('data-h-test')
      })
    const html = (await doc.convert(options)) as unknown as string
    assert.match(
      html,
      /<div class="data-line-\d+ data-h-test"><pre class='mermaid'>graph TD\n {2}A --> B<\/pre><\/div>/,
      `expected the Mermaid passthrough wrapped with its roles in:\n${html}`,
    )
  })

  // #598 / #322: the `stylesheet` (and `stylesdir`) document attributes should
  // drive the preview stylesheet just like Asciidoctor's own HTML output, and
  // supersede the built-in default stylesheet.
  test('Should link the `stylesheet` document attribute and drop the default stylesheet', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n:stylesheet: my-theme.css\n\nSome content',
      undefined,
    )
    assert.ok(
      html.includes('class="code-user-style"') && html.includes('my-theme.css'),
      `expected a custom stylesheet link in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-default.css'),
      `the default stylesheet must be replaced in:\n${html}`,
    )
  })

  test('Should look up the `stylesheet` under `stylesdir`', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n:stylesdir: css\n:stylesheet: my-theme.css\n\nSome content',
      undefined,
    )
    assert.ok(
      html.includes('css/my-theme.css') || html.includes('css%2Fmy-theme.css'),
      `expected the stylesheet resolved under stylesdir in:\n${html}`,
    )
  })

  test('Should use a URL `stylesheet` as-is (and ignore stylesdir)', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n:stylesdir: css\n:stylesheet: https://example.com/theme.css\n\nSome content',
      undefined,
    )
    assert.ok(
      html.includes('href="https://example.com/theme.css"'),
      `expected the URL stylesheet used verbatim in:\n${html}`,
    )
    // `stylesdir` must not be prepended to a URL stylesheet.
    assert.ok(
      !html.includes('css/https://example.com/theme.css'),
      `stylesdir must be ignored for a URL stylesheet in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-default.css') &&
        !html.includes('asciidoctor-editor.css'),
      `the built-in stylesheet must be replaced in:\n${html}`,
    )
  })

  test('Should use an absolute `stylesheet` path as-is (and ignore stylesdir)', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n:stylesdir: css\n:stylesheet: /etc/themes/my-theme.css\n\nSome content',
      undefined,
    )
    assert.ok(
      html.includes('class="code-user-style"') &&
        html.includes('/etc/themes/my-theme.css'),
      `expected the absolute stylesheet used verbatim in:\n${html}`,
    )
    // `stylesdir` must not be prepended to an absolute stylesheet.
    assert.ok(
      !html.includes('css/etc/themes/my-theme.css'),
      `stylesdir must be ignored for an absolute stylesheet in:\n${html}`,
    )
  })

  test('Should keep the built-in stylesheet when no `stylesheet` attribute is set', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
    )
    assert.ok(
      html.includes('asciidoctor-default.css') ||
        html.includes('asciidoctor-editor.css'),
      `expected the built-in stylesheet in:\n${html}`,
    )
    assert.ok(
      !html.includes('class="code-user-style"'),
      `expected no custom stylesheet link in:\n${html}`,
    )
  })

  test('Should use the VS Code preview stylesheet by default', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'vscode',
    )
    assert.ok(
      html.includes('asciidoctor-editor.css'),
      `expected the VS Code preview stylesheet in:\n${html}`,
    )
    assert.ok(
      html.includes('asciidoctor-editor-enhancements.css'),
      `expected the VS Code preview stylesheet enhancements in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-default.css'),
      `expected the Asciidoctor default stylesheet to be absent in:\n${html}`,
    )
  })

  test('Should use the Asciidoctor.js stylesheet when selected', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'asciidoctor',
    )
    assert.ok(
      html.includes('asciidoctor-default.css'),
      `expected the Asciidoctor.js stylesheet in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-editor.css'),
      `expected the VS Code preview stylesheet to be absent in:\n${html}`,
    )
  })

  test('Should use the Antora-inspired stylesheet when selected', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'antora',
    )
    assert.ok(
      html.includes('asciidoctor-default.css') &&
        html.includes('asciidoctor-antora.css'),
      `expected the Asciidoctor default base and Antora stylesheet in:\n${html}`,
    )
    assert.ok(
      html.indexOf('asciidoctor-default.css') <
        html.indexOf('asciidoctor-antora.css'),
      `expected the Antora stylesheet to be layered after the default base in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-editor.css'),
      `expected the VS Code preview stylesheet to be absent in:\n${html}`,
    )
  })

  test('Should auto-select the Antora-inspired stylesheet when Antora support is active and no style was chosen', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      undefined,
      createAntoraDocumentContextStub(undefined),
    )
    assert.ok(
      html.includes('asciidoctor-default.css') &&
        html.includes('asciidoctor-antora.css'),
      `expected the Antora stylesheet to be auto-selected in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-editor.css'),
      `expected the VS Code preview stylesheet to be absent in:\n${html}`,
    )
  })

  test('Should auto-select the Antora-inspired stylesheet when the deprecated useEditorStyle is false and Antora support is active', async () => {
    // Neither value of the legacy useEditorStyle boolean expresses an
    // opinion about Antora, so it must not block auto-detection the way an
    // explicit `defaultStyle` would (see the previous test).
    await vscode.workspace
      .getConfiguration('asciidoc', null)
      .update('preview.useEditorStyle', false)
    try {
      const html = await convertStandaloneWithFragment(
        '= Title\n\nSome content',
        undefined,
        undefined,
        createAntoraDocumentContextStub(undefined),
      )
      assert.ok(
        html.includes('asciidoctor-antora.css'),
        `expected the Antora stylesheet to be auto-selected in:\n${html}`,
      )
    } finally {
      await vscode.workspace
        .getConfiguration('asciidoc', null)
        .update('preview.useEditorStyle', undefined)
    }
  })

  test('Should keep an explicitly selected stylesheet even when Antora support is active', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'github',
      createAntoraDocumentContextStub(undefined),
    )
    assert.ok(
      html.includes('asciidoctor-github-colors.css'),
      `expected the explicitly selected github stylesheet in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-antora.css'),
      `expected the Antora stylesheet to stay absent in:\n${html}`,
    )
  })

  test('Should stamp the resolved preview style on the body element', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'github',
    )
    assert.ok(
      html.includes('data-preview-style="github"'),
      `expected the resolved preview style on <body> in:\n${html}`,
    )
  })

  test('Should use the github stylesheet when selected', async () => {
    const html = await convertStandaloneWithFragment(
      '= Title\n\nSome content',
      undefined,
      'github',
    )
    assert.ok(
      html.includes('asciidoctor-default.css') &&
        html.includes('asciidoctor-github-colors.css') &&
        html.includes('asciidoctor-github.css'),
      `expected the Asciidoctor default base, GitHub color tokens, and GitHub stylesheet in:\n${html}`,
    )
    assert.ok(
      html.indexOf('asciidoctor-default.css') <
        html.indexOf('asciidoctor-github-colors.css') &&
        html.indexOf('asciidoctor-github-colors.css') <
          html.indexOf('asciidoctor-github.css'),
      `expected the GitHub stylesheets to be layered after the default base in:\n${html}`,
    )
    assert.ok(
      !html.includes('asciidoctor-editor.css'),
      `expected the VS Code preview stylesheet to be absent in:\n${html}`,
    )
  })

  // The `data-shell` fingerprint hashes the document-driven parts of the
  // webview shell (MathJax, syntax highlighter, docinfo, body classes…) that an
  // incremental morph of `#preview-root` cannot update. The preview falls back
  // to a full reload when it changes; see AsciidocPreview.doUpdate.
  function readShellFingerprint(html: string): string {
    const match = /\bdata-shell="([^"]*)"/.exec(html)
    assert.ok(match, `expected a data-shell fingerprint in:\n${html}`)
    return match[1]
  }

  test('Should keep the shell fingerprint stable across renders of an identical document', async () => {
    const input = '= Title\n:stem:\n\nstem:[x^2]'
    const first = await convertStandaloneWithFragment(input, undefined)
    // The CSP nonce is derived from the clock: wait so the second render gets a
    // different nonce, proving the fingerprint does not depend on it.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await convertStandaloneWithFragment(input, undefined)
    assert.strictEqual(
      readShellFingerprint(first),
      readShellFingerprint(second),
      'an identical document must produce the same shell fingerprint',
    )
  })

  test('Should change the shell fingerprint when `stem` is toggled', async () => {
    const without = await convertStandaloneWithFragment(
      '= Title\n\nstem:[x^2]',
      undefined,
    )
    const withStem = await convertStandaloneWithFragment(
      '= Title\n:stem:\n\nstem:[x^2]',
      undefined,
    )
    assert.notStrictEqual(
      readShellFingerprint(without),
      readShellFingerprint(withStem),
      'toggling :stem: must change the shell fingerprint (MathJax must be (un)loaded by a full reload)',
    )
  })

  test('Should change the shell fingerprint when `source-highlighter` is toggled', async () => {
    const source = '[source,js]\n----\nconst x = 1\n----'
    const without = await convertStandaloneWithFragment(source, undefined)
    const withHighlighter = await convertStandaloneWithFragment(
      `:source-highlighter: highlight.js\n\n${source}`,
      undefined,
    )
    assert.notStrictEqual(
      readShellFingerprint(without),
      readShellFingerprint(withHighlighter),
      'toggling :source-highlighter: must change the shell fingerprint (highlight.js must be (un)loaded by a full reload)',
    )
  })

  test('Should change the shell fingerprint when Antora support (and the auto-selected style) toggles', async () => {
    const input = '= Title\n\nSome content'
    const withoutAntora = await convertStandaloneWithFragment(input, undefined)
    const withAntora = await convertStandaloneWithFragment(
      input,
      undefined,
      undefined,
      createAntoraDocumentContextStub(undefined),
    )
    assert.notStrictEqual(
      readShellFingerprint(withoutAntora),
      readShellFingerprint(withAntora),
      'toggling Antora support must change the shell fingerprint (the auto-selected stylesheet must be (un)loaded by a full reload)',
    )
  })

  for (const testCase of testCases) {
    if (testCase.standalone) {
      test(testCase.title, async () =>
        testAsciidoctorWebViewConverterStandalone(
          testCase.input,
          testCase.antoraDocumentContext,
          testCase.expected,
          workspaceUri,
          testCase.filePath,
        ),
      )
    } else {
      test(testCase.title, async () =>
        testAsciidoctorWebViewConverter(
          testCase.input,
          testCase.antoraDocumentContext,
          testCase.expected,
          workspaceUri,
          testCase.filePath,
        ),
      )
    }
  }
})
