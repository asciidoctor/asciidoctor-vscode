import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import { AsciidocIncludeItemsLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorIncludeItems } from '../features/asciidoctorIncludeItems'
import LinkProvider from '../features/documentLinkProvider'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'
import { extensionContext } from './helper'
import { InMemoryDocument } from './inMemoryDocument'

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

function assertRangeEqual(expected: vscode.Range, actual: vscode.Range) {
  assert.strictEqual(expected.start.line, actual.start.line)
  assert.strictEqual(expected.start.character, actual.start.character)
  assert.strictEqual(expected.end.line, actual.end.line)
  assert.strictEqual(expected.end.character, actual.end.character)
}

suite('asciidoc.DocumentLinkProvider', async () => {
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
      JSON.stringify({
        path: 'test.adoc',
        fragment: 'L3',
      }),
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
      JSON.stringify({
        path: 'test.adoc',
        fragment: 'L9',
      }),
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
})
