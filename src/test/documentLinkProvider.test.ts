/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import LinkProvider from '../features/documentLinkProvider'
import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.md')

const noopToken = new class implements vscode.CancellationToken {
  private _onCancellationRequestedEmitter = new vscode.EventEmitter<void>()
  public onCancellationRequested = this._onCancellationRequestedEmitter.event

  get isCancellationRequested () { return false }
}()

async function getLinksForFile (fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new LinkProvider()
  return provider.provideDocumentLinks(doc, noopToken)
}

function assertRangeEqual (expected: vscode.Range, actual: vscode.Range) {
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
})
