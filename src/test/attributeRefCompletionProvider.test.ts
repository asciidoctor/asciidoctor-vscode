import 'mocha'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import assert from 'assert'
import { AttributeReferenceProvider } from '../features/attributeReferenceProvider'
import { createFile } from './workspaceHelper'
import { AsciidocLoader } from '../asciidocLoader'
import { AsciidoctorConfig } from '../features/asciidoctorConfig'
import { AsciidoctorExtensions } from '../features/asciidoctorExtensions'
import { AsciidoctorDiagnostic } from '../features/asciidoctorDiagnostic'
import { extensionContext } from './helper'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../security'

function filterByLabel (label: string): (CompletionItem) => boolean {
  return (item) => {
    if ((item.label as vscode.CompletionItemLabel)) {
      return (item.label as vscode.CompletionItemLabel).label === label
    }
    return false
  }
}

async function findCompletionItems (uri: vscode.Uri, position: vscode.Position, filter?: (completionItem) => boolean) {
  const textDocument = await vscode.workspace.openTextDocument(uri)
  const asciidocLoader = new AsciidocLoader(
    new AsciidoctorConfig(),
    new AsciidoctorExtensions(AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext)),
    new AsciidoctorDiagnostic('test'),
    extensionContext
  )
  const completionsItems = await new AttributeReferenceProvider(asciidocLoader).provideCompletionItems(textDocument, position)
  if (filter) {
    return completionsItems.filter(filter)
  }
  return completionsItems
}

suite('Attribute ref CompletionsProvider', () => {
  let createdFiles: vscode.Uri[] = []
  teardown(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })
  test('Should return attribute key defined in same file', async () => {
    const fileToAutoComplete = await createFile(`:my-attribute-to-find-in-completion: dummy value
`, 'fileToAutoComplete-attributeRef-samefile.adoc')
    createdFiles.push(fileToAutoComplete)
    const items = await findCompletionItems(fileToAutoComplete, new Position(1, 0), filterByLabel('my-attribute-to-find-in-completion'))
    const completionItem = items[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
  test('Should return attribute key defined in same file corresponding to its value', async () => {
    const fileToAutoComplete = await createFile(`:my-attribute-to-find-in-completion: dummy value
dumm`, 'fileToAutoComplete-attributeRef.adoc')
    createdFiles.push(fileToAutoComplete)
    const items = await findCompletionItems(fileToAutoComplete, new Position(1, 3), filterByLabel('my-attribute-to-find-in-completion'))
    const completionItem = items[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
  test('Should return no completion when nothing corresponds', async () => {
    const fileToAutoComplete = await createFile(`:my-attribute-to-find-in-completion: dummy value
somethingVeryDifferent`, 'fileToAutoComplete-attributeRef-samefile-basedOnValue.adoc')
    createdFiles.push(fileToAutoComplete)
    const items = await findCompletionItems(fileToAutoComplete, new Position(1, 22))
    assert.notStrictEqual(items.length, 0, 'There are completion provided although none are expected.')
  })
  test('Should return an attribute defined in another file', async () => {
    const fileToAutoComplete = await createFile(`= test
include::file-referenced-with-an-attribute.adoc[]


    `, 'fileToAutoComplete-attributeRef-differentFile.adoc')
    createdFiles.push(fileToAutoComplete)
    const fileReferencedWithAnAttribute = await createFile(':my-attribute-to-find-in-completion: dummy value', 'file-referenced-with-an-attribute.adoc')
    createdFiles.push(fileReferencedWithAnAttribute)
    const items = await findCompletionItems(fileToAutoComplete, new Position(3, 0), filterByLabel('my-attribute-to-find-in-completion'))
    const completionItem = items[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{my-attribute-to-find-in-completion}')
  })
  test('Should disable auto-completion on literal paragraph', async () => {
    const fileToAutoComplete = await createFile(`= test
:fn-type: pure

 function foo() {

The above function is {
    `, 'disable-autocompletion-literal-paragraph.adoc')
    createdFiles.push(fileToAutoComplete)
    let items = await findCompletionItems(fileToAutoComplete, new Position(3, 17))
    assert.deepStrictEqual(items.length, 0, 'should not provide attributes completion on literal paragraphs.')

    items = await findCompletionItems(fileToAutoComplete, new Position(5, 1))
    assert.deepStrictEqual(items.length > 0, true, 'should provide attribute completion on paragraphs.')
  })
  test('Should disable auto-completion on verbatim blocks', async () => {
    const fileToAutoComplete = await createFile(`= test
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
    `, 'disable-autocompletion-verbatim-blocks.adoc')
    createdFiles.push(fileToAutoComplete)
    let completionsItems = await findCompletionItems(fileToAutoComplete, new Position(4, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on source blocks.')

    completionsItems = await findCompletionItems(fileToAutoComplete, new Position(8, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on listing blocks.')

    completionsItems = await findCompletionItems(fileToAutoComplete, new Position(12, 18))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on listing blocks (indented).')

    completionsItems = await findCompletionItems(fileToAutoComplete, new Position(17, 16))
    assert.deepStrictEqual(completionsItems.length, 0, 'should not provide attributes completion on literal blocks.')

    completionsItems = await findCompletionItems(fileToAutoComplete, new Position(24, 12))
    assert.deepStrictEqual(completionsItems.length > 0, true, 'should provide attribute completion verbatim blocks with attributes subs.')

    completionsItems = await findCompletionItems(fileToAutoComplete, new Position(28, 17))
    assert.deepStrictEqual(completionsItems.length > 0, true, 'should provide attribute completion on paragraphs.')
  })
  test('Should return an attribute defined in .asciidoctorconfig', async () => {
    const fileToAutoComplete = await createFile(`= test

{
    `, 'autocompletion-from-asciidoctorconfig.adoc')
    createdFiles.push(fileToAutoComplete)
    const asciidoctorConfigFile = await createFile(':attribute-defined-in-asciidoctorconfig: dummy value', '.asciidoctorconfig')
    createdFiles.push(asciidoctorConfigFile)
    const completionsItems = await findCompletionItems(fileToAutoComplete, new Position(3, 2), filterByLabel('attribute-defined-in-asciidoctorconfig'))
    const completionItem = completionsItems[0]
    assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
    assert.deepStrictEqual(completionItem.insertText, '{attribute-defined-in-asciidoctorconfig}')
  })
  test('Should return an attribute defined in the plugin configuration', async () => {
    try {
      const asciidocPreviewConfig = vscode.workspace.getConfiguration('asciidoc.preview', null)
      await asciidocPreviewConfig.update('asciidoctorAttributes', {
        'attribute-defined-in-config': 'dummy value',
      })
      const fileToAutoComplete = await createFile(`= test

{
    `, 'autocompletion-from-plugin-configuration.adoc')
      createdFiles.push(fileToAutoComplete)
      const completionsItems = await findCompletionItems(fileToAutoComplete, new Position(3, 2), filterByLabel('attribute-defined-in-config'))
      const completionItem = completionsItems[0]
      assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'dummy value')
      assert.deepStrictEqual(completionItem.insertText, '{attribute-defined-in-config}')
    } finally {
      await vscode.workspace.getConfiguration('asciidoc.preview', null).update('asciidoctorAttributes', undefined)
    }
  })
  test('Should return an attribute defined in another file (target contains an attribute reference)', async () => {
    try {
      const asciidocPreviewConfig = vscode.workspace.getConfiguration('asciidoc.preview', null)
      await asciidocPreviewConfig.update('asciidoctorAttributes', {
        'include-target': 'attributes',
      })
      const fileToAutoComplete = await createFile(`= test
include::autocompletion-{include-target}.adoc[]

{
    `, 'autocompletion-from-include-file-target-attrs.adoc')
      createdFiles.push(fileToAutoComplete)
      const fileReferencedWithAnAttribute = await createFile(':foo: bar', 'autocompletion-attributes.adoc')
      createdFiles.push(fileReferencedWithAnAttribute)
      const completionsItems = await findCompletionItems(fileToAutoComplete, new Position(4, 2), filterByLabel('foo'))
      const completionItem = completionsItems[0]
      assert.deepStrictEqual((completionItem.label as vscode.CompletionItemLabel).description, 'bar')
      assert.deepStrictEqual(completionItem.insertText, '{foo}')
    } finally {
      await vscode.workspace.getConfiguration('asciidoc.preview', null).update('asciidoctorAttributes', undefined)
    }
  })
})
