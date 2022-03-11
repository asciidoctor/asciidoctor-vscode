/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import 'mocha'
import * as vscode from 'vscode'
import SymbolProvider from '../features/documentSymbolProvider'
import { InMemoryDocument } from './inMemoryDocument'
import { createNewAsciidocEngine } from './engine'

const testFileName = vscode.Uri.file('test.adoc')

function getSymbolsForFile (fileContents: string) {
  const doc = new InMemoryDocument(testFileName, fileContents)
  const provider = new SymbolProvider(createNewAsciidocEngine(), null)
  return provider.provideDocumentSymbols(doc)
}

suite('asciidoc.DocumentSymbolProvider', () => {
  test('Should not return anything for empty document', async () => {
    const symbols = await getSymbolsForFile('')
    assert.strictEqual(symbols.length, 0)
  })

  test('Should not return anything for document with no headers', async () => {
    const symbols = await getSymbolsForFile('a\na')
    assert.strictEqual(symbols.length, 0)
  })
})
