/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import * as vscode from 'vscode'
import 'mocha'

import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { InMemoryDocument } from './inMemoryDocument'
import { createNewAsciidocEngine } from './engine'

const testFileName = vscode.Uri.file('test.md')

suite('asciidoc.TableOfContentsProvider', () => {
  test('Lookup should not return anything for empty document', async () => {
    const doc = new InMemoryDocument(testFileName, '')
    const provider = new TableOfContentsProvider(createNewAsciidocEngine(), doc)

    assert.strictEqual(await provider.lookup(''), undefined)
    assert.strictEqual(await provider.lookup('foo'), undefined)
  })

  test('Lookup should not return anything for document with no headers', async () => {
    const doc = new InMemoryDocument(testFileName, 'a *b*\nc')
    const provider = new TableOfContentsProvider(createNewAsciidocEngine(), doc)

    assert.strictEqual(await provider.lookup(''), undefined)
    assert.strictEqual(await provider.lookup('foo'), undefined)
    assert.strictEqual(await provider.lookup('a'), undefined)
    assert.strictEqual(await provider.lookup('b'), undefined)
  })
})
