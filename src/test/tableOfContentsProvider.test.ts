/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert'
import * as vscode from 'vscode'
import 'mocha'

import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.md')

suite.only('asciidoc.TableOfContentsProvider', () => {
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

  test('Toc should contain top level element from first line', () => {
    const doc = new InMemoryDocument(testFileName, `= a section title

content`)
    const provider = new TableOfContentsProvider(doc)

    assert.strictEqual(provider.getToc().length, 1)
  })

  suite('With includes', () => {
    let createdFiles: vscode.Uri[] = []
    let root: string
    setup(() => {
      root = vscode.workspace.workspaceFolders[0].uri.fsPath
    })
    teardown(async () => {
      for (const createdFile of createdFiles) {
        await vscode.workspace.fs.delete(createdFile)
      }
      createdFiles = []
    })

    test('Toc should contain top level element from first line', async () => {
      const fileToHaveTOC = vscode.Uri.file(`${root}/fileToHaveTOC.adoc`)
      await vscode.workspace.fs.writeFile(fileToHaveTOC, Buffer.from(`= a section title
include::includedFile.adoc[]

content`))
      createdFiles.push(fileToHaveTOC)

      const includedFile = vscode.Uri.file(`${root}/includedFile.adoc`)
      await vscode.workspace.fs.writeFile(includedFile, Buffer.from(':dummy: dummy'))
      createdFiles.push(includedFile)

      const doc = await vscode.workspace.openTextDocument(fileToHaveTOC)
      const provider = new TableOfContentsProvider(doc)

      assert.strictEqual(provider.getToc().length, 1)
    })
  })
})
