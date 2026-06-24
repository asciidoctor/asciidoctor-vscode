import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import * as vscode from 'vscode'
import { AsciidocIncludeItemsLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { AsciidoctorIncludeItems } from '../features/asciidoctor/asciidoctorIncludeItems.js'
import LinkProvider from '../features/documentLinkProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'
import { InMemoryDocument } from './inMemoryDocument.js'

const noopToken = new (class implements vscode.CancellationToken {
  private _onCancellationRequestedEmitter = new vscode.EventEmitter<void>()
  public onCancellationRequested = this._onCancellationRequestedEmitter.event

  get isCancellationRequested() {
    return false
  }
})()

async function getLinksForFile(
  fileContents: string,
  testFileName?: vscode.Uri,
) {
  const doc = new InMemoryDocument(
    testFileName || vscode.Uri.file('test.adoc'),
    fileContents,
  )
  const provider = new LinkProvider(
    new AsciidocIncludeItemsLoader(
      new AsciidoctorIncludeItems(),
      new AsciidoctorConfig(),
      new AsciidoctorExtensions(
        AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
      ),
      new AsciidoctorDiagnostic('test'),
      extensionContext,
    ),
  )
  return provider.provideDocumentLinks(doc, noopToken)
}

function createIncludeItemsLoader() {
  return new AsciidocIncludeItemsLoader(
    new AsciidoctorIncludeItems(),
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(
      AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
    ),
    new AsciidoctorDiagnostic('test-include-items'),
    extensionContext,
  )
}

function assertRangeEqual(expected: vscode.Range, actual: vscode.Range) {
  assert.strictEqual(expected.start.line, actual.start.line)
  assert.strictEqual(expected.start.character, actual.start.character)
  assert.strictEqual(expected.end.line, actual.end.line)
  assert.strictEqual(expected.end.character, actual.end.character)
}

describe('asciidoc.DocumentLinkProvider', async () => {
  test('Should not return anything for empty document', async () => {
    const links = await getLinksForFile('')
    assert.strictEqual(links.length, 0)
  })

  test('Should not return anything for simple document without include', async () => {
    const links = await getLinksForFile(`= a

b

c`)
    assert.strictEqual(links.length, 0)
  })

  test('Should detect basic include', async () => {
    const links = await getLinksForFile(`a

include::b.adoc[]

c`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assertRangeEqual(link.range, new vscode.Range(2, 9, 2, 15))
  })

  test('Should detect basic workspace include', async () => {
    {
      const links = await getLinksForFile(`a

include::./b.adoc[]

c`)
      assert.strictEqual(links.length, 1)
      const [link] = links
      assertRangeEqual(link.range, new vscode.Range(2, 9, 2, 17))
    }
    {
      const links = await getLinksForFile(`a

[source,ruby]
----
include::core.rb[tag=parse]
----

b
`)
      assert.strictEqual(links.length, 1)
      const [link] = links
      assertRangeEqual(link.range, new vscode.Range(4, 9, 4, 16))
    }
  })

  test('Should detect inline anchor using [[idname]] syntax and xref', async () => {
    const links = await getLinksForFile(`= Title

[[first-section]]
== Section Title

Paragraph.

== Second Section Title

See xref:test.adoc#first-section[]
`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assert.strictEqual(link.target.scheme, 'command')
    assert.deepStrictEqual(link.target.path, '_asciidoc.openDocumentLink')
    assert.strictEqual(
      link.target.query,
      JSON.stringify({ path: 'test.adoc', fragment: 'L3' }),
    )
    assertRangeEqual(link.range, new vscode.Range(9, 9, 9, 32))
  })

  test('Should detect xref and inline anchor using [[idname]] syntax', async () => {
    const links = await getLinksForFile(`= Title

[[first-section]]
== Section Title

Paragraph.
See xref:test.adoc#second-section[]

[[second-section]]
== Second Section Title

`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assert.strictEqual(link.target.scheme, 'command')
    assert.deepStrictEqual(link.target.path, '_asciidoc.openDocumentLink')
    assert.strictEqual(
      link.target.query,
      JSON.stringify({ path: 'test.adoc', fragment: 'L9' }),
    )
    assertRangeEqual(link.range, new vscode.Range(6, 9, 6, 33))
  })

  test('Should detect inline URL', async () => {
    const links = await getLinksForFile(`= Title

You can refer to a URL such as https://github.com/asciidoctor/asciidoctor-vscode/, and continue the sentence or the paragraph.

`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assert.deepStrictEqual(
      link.target.toString(),
      'https://github.com/asciidoctor/asciidoctor-vscode/',
    )
    assertRangeEqual(link.range, new vscode.Range(2, 31, 2, 81))
  })

  test('Should detect inline URL within square brackets', async () => {
    const links = await getLinksForFile(`= Title

Filters are created as RPN filters (Reverse Polish notation [https://wikipedia.org/wiki/Reverse_Polish_notation]) with the following syntax...

`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assert.deepStrictEqual(
      link.target.toString(),
      'https://wikipedia.org/wiki/Reverse_Polish_notation',
    )
    assertRangeEqual(link.range, new vscode.Range(2, 61, 2, 111))
  })

  test('Should detect inline URL within angle brackets', async () => {
    const links = await getLinksForFile(`= Title

Asciidoctor.js is published as a npm package at <https://www.npmjs.com/package/@asciidoctor/core>.

`)
    assert.strictEqual(links.length, 1)
    const [link] = links
    assert.deepStrictEqual(
      link.target.toString(true),
      'https://www.npmjs.com/package/@asciidoctor/core',
    )
    assertRangeEqual(link.range, new vscode.Range(2, 49, 2, 96))
  })

  // Enumerating includes for document links stubs every include with a
  // `nothing` placeholder, which strips the callout markers from a source
  // block and makes Asciidoctor log "no callout found for <n>". That degraded
  // parse must not publish diagnostics, otherwise it surfaces false positives
  // (#971) and clears the legitimate diagnostics produced by the preview (#944).
  test('Should not publish diagnostics when enumerating includes (callouts in an included source block)', async () => {
    const uri = vscode.Uri.file('include-callouts.adoc')
    const doc = new InMemoryDocument(
      uri,
      `= Title

[source,ruby]
----
include::code-with-callouts.rb[]
----
<1> one
<2> two
<3> three
`,
    )
    const loader = createIncludeItemsLoader()
    // sanity check: the include is still detected for the link provider
    const items = await loader.getIncludeItems(doc)
    assert.strictEqual(items.length, 1)
    // the degraded parse must not have published any diagnostic
    const diagnostics = vscode.languages.getDiagnostics(uri)
    assert.deepStrictEqual(
      diagnostics,
      [],
      `expected no diagnostics, got: ${diagnostics.map((d) => d.message).join(', ')}`,
    )
  })

  // An include placed before the document title must not be replaced by a
  // placeholder paragraph: that would push `= Document Title` into the body and
  // produce a spurious "level 0 sections can only be used when doctype is book"
  // (#987). The include is replaced by an empty line, and this enumeration path
  // does not publish diagnostics anyway.
  test('Should not publish diagnostics for an include placed before the document title (#987)', async () => {
    const uri = vscode.Uri.file('include-before-title.adoc')
    const doc = new InMemoryDocument(
      uri,
      `include::before-title.adoc[]

= Document Title
`,
    )
    const loader = createIncludeItemsLoader()
    const items = await loader.getIncludeItems(doc)
    assert.strictEqual(items.length, 1)
    const diagnostics = vscode.languages.getDiagnostics(uri)
    assert.deepStrictEqual(
      diagnostics,
      [],
      `expected no diagnostics, got: ${diagnostics.map((d) => d.message).join(', ')}`,
    )
  })
})
