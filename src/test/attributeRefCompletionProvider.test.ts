import 'mocha'
import * as vscode from 'vscode'
import assert from 'assert'
import { AttributeReferenceProvider } from '../features/attributeReferenceProvider'
import { Position } from 'vscode'

let root

suite('Attribute ref CompletionsProvider', () => {
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
  test('Should return attribute key defined in same file', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete-attributeRef-samfile.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`:my-attribute-to-find-in-completion: dummy value
`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = new AttributeReferenceProvider().provideCompletionItems(file, new Position(1, 0))
    const filteredCompletionItems = completionsItems.filter((completionItem) => {
      if ((completionItem.label as vscode.CompletionItemLabel)) {
        return (completionItem.label as vscode.CompletionItemLabel).label === 'my-attribute-to-find-in-completion'
      } else {
        return false
      }
    })
    const completionItem = filteredCompletionItems[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
  test('Should return attribute key defined in same file corresponding to its value', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete-attributeRef.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`:my-attribute-to-find-in-completion: dummy value
dumm`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = new AttributeReferenceProvider().provideCompletionItems(file, new Position(1, 3))
    const filteredCompletionItems = completionsItems.filter((completionItem) => (completionItem.label as vscode.CompletionItemLabel).label === 'my-attribute-to-find-in-completion')
    const completionItem = filteredCompletionItems[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
  test('Should return no completion when nothing corresponds', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete-attributeRef-samefile-basedOnValue.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`:my-attribute-to-find-in-completion: dummy value
somethingVeryDifferent`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = new AttributeReferenceProvider().provideCompletionItems(file, new Position(1, 22))
    assert.notStrictEqual(completionsItems.length, 0, 'There are Completion provided although none are expected.')
  })
  test('Should return attribute key defined in another file', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete-attributeRef-differentFile.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`= test
include::file-referenced-with-an-attribute.adoc[]


    `))
    createdFiles.push(fileToAutoComplete)

    const fileReferencedWithAnAttribute = vscode.Uri.file(`${root}/file-referenced-with-an-attribute.adoc`)
    await vscode.workspace.fs.writeFile(fileReferencedWithAnAttribute, Buffer.from(':my-attribute-to-find-in-completion: dummy value'))
    createdFiles.push(fileReferencedWithAnAttribute)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = new AttributeReferenceProvider().provideCompletionItems(file, new Position(3, 0))
    const filteredCompletionItems = completionsItems.filter((completionItem) => {
      if ((completionItem.label as vscode.CompletionItemLabel)) {
        return (completionItem.label as vscode.CompletionItemLabel).label === 'my-attribute-to-find-in-completion'
      } else {
        return false
      }
    })
    const completionItem = filteredCompletionItems[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
})
