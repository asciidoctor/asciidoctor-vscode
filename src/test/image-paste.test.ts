import * as vscode from 'vscode'
import assert from 'assert'
import { Import } from '../image-paste'
import { InMemoryDocument } from './inMemoryDocument'

const testFileName = vscode.Uri.file('test.adoc')

suite('getCurrentImagesDir', () => {
  test('Should return blank when the document is blank', () => {
    assert.strictEqual(Import.Image.getCurrentImagesDir(new InMemoryDocument(testFileName, ''), new vscode.Selection(0, 0, 0, 0)), '')
  })

  test('Should return imagesdir attribute defined in the AsciiDoc document', () => {
    const content = `= Document Title
:imagesdir: /path/to/images
`
    const document = new InMemoryDocument(testFileName, content)
    assert.strictEqual(Import.Image.getCurrentImagesDir(document, new vscode.Selection(0, 0, 0, 0)), '/path/to/images')
  })

  test('Should return imagesdir depending on active line', () => {
    const textDocument = new InMemoryDocument(testFileName, `= Document Title
:imagesdir: /path/to/images

This is a preamble.

== Section Title

:imagesdir: /path/to/assets

:imagesdir: /path/to/img
`)
    // document attribute
    assert.strictEqual(Import.Image.getCurrentImagesDir(textDocument, new vscode.Selection(2, 0, 2, 0)), '/path/to/images')
    // attribute defined at line 7
    assert.strictEqual(Import.Image.getCurrentImagesDir(textDocument, new vscode.Selection(8, 0, 8, 0)), '/path/to/assets')
    // attribute defined at line 9
    assert.strictEqual(Import.Image.getCurrentImagesDir(textDocument, new vscode.Selection(10, 0, 10, 0)), '/path/to/img')
  })
})
