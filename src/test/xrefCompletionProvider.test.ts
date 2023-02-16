import 'mocha'
import * as vscode from 'vscode'
import assert from 'assert'
import { xrefProvider } from '../providers/xref.provider'
import { Position } from 'vscode'

let root

suite('Xref CompletionsProvider', () => {
  let createdFiles: vscode.Uri[] = []
  setup(() => {
    root = vscode.workspace.workspaceFolders[0].uri.fsPath
  })
  teardown(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
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
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'fileToAppearInAutoComplete.adoc#anOldStyleID[]')
    assert.deepStrictEqual(filteredCompletionItems[0], new vscode.CompletionItem('fileToAppearInAutoComplete.adoc#anOldStyleID[]', vscode.CompletionItemKind.Reference))
  })
  test('Should return ids declared using the shorthand syntax as completion after "xref:"', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from('xref:'))
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.file(`${root}/fileToAppearInAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileThatShouldAppearInAutoComplete, Buffer.from('[#aShortHandID]'))
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(0, 5))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'fileToAppearInAutoComplete.adoc#aShortHandID[]')
    assert.deepStrictEqual(filteredCompletionItems[0], new vscode.CompletionItem('fileToAppearInAutoComplete.adoc#aShortHandID[]', vscode.CompletionItemKind.Reference))
  })
  test('Should return ids declared using the longhand syntax as completion after "xref:" from other document', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from('xref:'))
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.file(`${root}/fileToAppearInAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileThatShouldAppearInAutoComplete, Buffer.from('[id=longHandID]'))
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(0, 5))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'fileToAppearInAutoComplete.adoc#longHandID[]')
    assert.deepStrictEqual(filteredCompletionItems[0], new vscode.CompletionItem(
      'fileToAppearInAutoComplete.adoc#longHandID[]',
      vscode.CompletionItemKind.Reference))
  })
  test('Should return ids declared using the longhand syntax as completion after "xref:" from same document', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoCompleteFromSameFile.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`[id=longHandID]

xref:`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(2, 5))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'longHandID[]')
    assert.deepStrictEqual(filteredCompletionItems[0], new vscode.CompletionItem('longHandID[]', vscode.CompletionItemKind.Reference))
  })
  test('Should return id for inlined anchor', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToTestXrefAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`* [id=anInlinedAnchor]demo

xref:`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(2, 5))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'anInlinedAnchor[]')
    assert.deepStrictEqual(filteredCompletionItems[0], new vscode.CompletionItem('anInlinedAnchor[]', vscode.CompletionItemKind.Reference))
  })
  test('Should return id for element in same document after <<', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToTest<<AutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`[#anIDFromSameFile]

<<`))
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldntAppearInAutoComplete = vscode.Uri.file(`${root}/fileToNotAppearInAutoComplete.adoc`)
    await vscode.workspace.fs.writeFile(fileThatShouldntAppearInAutoComplete, Buffer.from('[#shouldNotAppear]'))
    createdFiles.push(fileThatShouldntAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(file, new Position(2, 2))
    const filteredCompletionItems = completionsItems.filter((completionItem) => completionItem.label === 'anIDFromSameFile')
    assert.deepStrictEqual(filteredCompletionItems[0], {
      kind: vscode.CompletionItemKind.Reference,
      label: 'anIDFromSameFile',
      insertText: 'anIDFromSameFile>>',
    })

    assert.strictEqual(completionsItems.filter((completionItem) => completionItem.label === 'shouldNotAppear').length, 0)
  })
})
