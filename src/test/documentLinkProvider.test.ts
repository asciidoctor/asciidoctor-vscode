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
  private _onCancellationRequestedEmitter = new vscode.EventEmitter<void>();
  public onCancellationRequested = this._onCancellationRequestedEmitter.event;

  get isCancellationRequested () { return false }
}()

function getLinksForFile (fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new LinkProvider()
  return provider.provideDocumentLinks(doc, noopToken)
}

suite('asciidoc.DocumentLinkProvider', () => {
  test('Should not return anything for empty document', () => {
    const links = getLinksForFile('')
    assert.strictEqual(links.length, 0)
  })

  test('Should not return anything for simple document without include', () => {
    const links = getLinksForFile(`= a

b

c`)
    assert.strictEqual(links.length, 0)
  })
})
