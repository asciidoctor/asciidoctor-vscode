import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import { BuiltinDocumentAttributeProvider } from '../features/completion/builtinDocumentAttributeProvider.js'
import { createFile } from './workspaceHelper.js'

function labelOf(item: vscode.CompletionItem): string {
  return (item.label as vscode.CompletionItemLabel).label
}

async function findCompletionItems(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<vscode.CompletionItem[]> {
  const textDocument = await vscode.workspace.openTextDocument(uri)
  return new BuiltinDocumentAttributeProvider().provideCompletionItems(
    textDocument,
    position,
  )
}

describe('Builtin document attribute CompletionsProvider', () => {
  let createdFiles: vscode.Uri[] = []
  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })

  test('Should offer attributes on a bare colon', async () => {
    const file = await createFile(':', 'builtin-attr-colon.adoc')
    createdFiles.push(file)
    const items = await findCompletionItems(file, new Position(0, 1))
    assert.ok(items.length > 0, 'should offer attributes after ":"')
  })

  test('Should offer attributes on an explicit completion of a partial name (e.g. ":sect")', async () => {
    const file = await createFile(':sect', 'builtin-attr-partial.adoc')
    createdFiles.push(file)
    const items = await findCompletionItems(file, new Position(0, 5))
    assert.ok(items.length > 0, 'should offer attributes after ":sect"')
    const sectItems = items.filter((item) => labelOf(item).startsWith(':sect'))
    assert.ok(
      sectItems.length > 0,
      'should keep attributes whose name starts with "sect" (e.g. :sectnums:)',
    )
    // The partially typed name must be replaced so the snippet is not appended to it.
    const completionItem = sectItems[0]
    assert.deepStrictEqual(
      completionItem.range,
      new vscode.Range(0, 1, 0, 5),
      'the inserted snippet should replace the typed attribute name',
    )
  })

  test('Should not offer attributes when the colon is not at the start of the line', async () => {
    const file = await createFile('foo :sect', 'builtin-attr-midline.adoc')
    createdFiles.push(file)
    const items = await findCompletionItems(file, new Position(0, 9))
    assert.deepStrictEqual(
      items,
      [],
      'should not offer attributes for an inline colon',
    )
  })
})
