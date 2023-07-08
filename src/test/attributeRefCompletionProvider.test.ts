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
  const attributeReferenceProvider = new AttributeReferenceProvider()
  test('Should return attribute key defined in same file', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/fileToAutoComplete-attributeRef-samefile.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`:my-attribute-to-find-in-completion: dummy value
`))
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(1, 0))
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
    const completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(1, 3))
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
    const completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(1, 22))
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
    const completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(3, 0))
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
  test('Should disable auto-completion on literal paragraph', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/disable-autocompletion-literal-paragraph.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`= test
:fn-type: pure

 function foo() {

The above function is {
    `))
    createdFiles.push(fileToAutoComplete)
    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    let completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(3, 17))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on literal paragraphs.')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(5, 1))
    assert.deepStrictEqual(completionsItems.length > 0, true, 'should provide attribute completion on paragraphs.')
  })
  test('Should disable auto-completion on verbatim blocks', async () => {
    const fileToAutoComplete = vscode.Uri.file(`${root}/disable-autocompletion-verbatim-blocks.adoc`)
    await vscode.workspace.fs.writeFile(fileToAutoComplete, Buffer.from(`= test
:app-version: 1.2.3

----
function foo() {
----

[listing]
function foo() {

....
function foo() {
  function bar() {
}
....

[literal]
function foo() {

[source,xml,subs=+attributes]
----
<dependency>
  <groupId>org.asciidoctor</groupId>
  <artifactId>asciidoctor-vscode</artifactId>
  <version>{</version>
</dependency>
----

Install version {
    `))
    createdFiles.push(fileToAutoComplete)
    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    let completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(4, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on source blocks.')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(8, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on listing blocks.')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(12, 18))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on listing blocks (indented).')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(17, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on literal blocks.')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(24, 12))
    assert.deepStrictEqual(completionsItems.length > 0, true, 'should provide attribute completion verbatim blocks with attributes subs.')

    completionsItems = attributeReferenceProvider.provideCompletionItems(file, new Position(28, 17))
    assert.deepStrictEqual(completionsItems.length > 0, true, 'should provide attribute completion on paragraphs.')
  })
})
