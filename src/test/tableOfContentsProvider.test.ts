/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import * as vscode from 'vscode'
import 'mocha'

import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.md')

suite('asciidoc.TableOfContentsProvider', () => {
  test('Lookup should not return anything for empty document', () => {
    const doc = new InMemoryDocument(testFileName, '')
    const provider = new TableOfContentsProvider(doc)

    assert.strictEqual(provider.lookup(''), undefined)
    assert.strictEqual(provider.lookup('foo'), undefined)
  })

  test('Lookup should not return anything for document with no headers', () => {
    const doc = new InMemoryDocument(testFileName, 'a *b*\nc')
    const provider = new TableOfContentsProvider(doc)

    assert.strictEqual(provider.lookup(''), undefined)
    assert.strictEqual(provider.lookup('foo'), undefined)
    assert.strictEqual(provider.lookup('a'), undefined)
    assert.strictEqual(provider.lookup('b'), undefined)
  })
})
