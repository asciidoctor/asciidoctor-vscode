import 'mocha'
import * as vscode from 'vscode'
import assert from 'assert'
import { xrefProvider } from '../providers/xref.provider'
import { Position } from 'vscode'

let root

suite('Xref CompletionsProvider', () => {
  const createdFiles: vscode.Uri[] = []
  setup(() => {
    root = vscode.workspace.workspaceFolders[0].uri.fsPath
  })
  teardown(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
  })
  test('Should return other ids from old style double-brackets as completion after "xref:"', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from('xref:'))
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.file(`${root}/fileToAppearInAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileThatShouldAppearInAutoComplete, Buffer.from('[[anOldStyleID]]'))
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(0, 5))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'anOldStyleID[]')
    assert.deepStrictEqual(filteredCompletionItems[0], {
      kind: vscode.CompletionItemKind.Reference,
      label: 'anOldStyleID[]',
    })
  })
})
