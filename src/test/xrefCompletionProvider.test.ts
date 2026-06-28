import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { Position } from 'vscode'
import { getDefaultWorkspaceFolderUri } from '../core/workspace.js'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { AsciidoctorConfig } from '../features/asciidoctor/asciidoctorConfig.js'
import { AsciidoctorDiagnostic } from '../features/asciidoctor/asciidoctorDiagnostic.js'
import { AsciidoctorExtensions } from '../features/asciidoctor/asciidoctorExtensions.js'
import { XrefCompletionProvider } from '../features/completion/xrefCompletionProvider.js'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from '../features/security.js'
import { extensionContext } from './helper.js'

let workspaceUri: vscode.Uri

describe('Xref CompletionsProvider', () => {
  let createdFiles: vscode.Uri[] = []
  let xrefProvider: XrefCompletionProvider
  beforeEach(() => {
    workspaceUri = getDefaultWorkspaceFolderUri()
    xrefProvider = new XrefCompletionProvider(
      new AsciidocLoader(
        new AsciidoctorConfig(),
        new AsciidoctorExtensions(
          AsciidoctorExtensionsSecurityPolicyArbiter.activate(extensionContext),
        ),
        new AsciidoctorDiagnostic('test'),
        extensionContext,
      ),
    )
  })
  afterEach(async () => {
    for (const createdFile of createdFiles) {
      await vscode.workspace.fs.delete(createdFile)
    }
    createdFiles = []
  })

  test('Should return other ids from old style double-brackets as completion after "xref:"', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from('xref:'),
    )
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAppearInAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileThatShouldAppearInAutoComplete,
      Buffer.from('[[anOldStyleID]]Some text.'),
    )
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(0, 5),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) =>
        completionItem.label ===
        'fileToAppearInAutoComplete.adoc#anOldStyleID[]',
    )
    assert.deepStrictEqual(
      filteredCompletionItems[0],
      new vscode.CompletionItem(
        'fileToAppearInAutoComplete.adoc#anOldStyleID[]',
        vscode.CompletionItemKind.Reference,
      ),
    )
  })

  test('Should return ids declared using the shorthand syntax as completion after "xref:"', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from('xref:'),
    )
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAppearInAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileThatShouldAppearInAutoComplete,
      Buffer.from('[#aShortHandID]\nSome text.'),
    )
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(0, 5),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) =>
        completionItem.label ===
        'fileToAppearInAutoComplete.adoc#aShortHandID[]',
    )
    assert.deepStrictEqual(
      filteredCompletionItems[0],
      new vscode.CompletionItem(
        'fileToAppearInAutoComplete.adoc#aShortHandID[]',
        vscode.CompletionItemKind.Reference,
      ),
    )
  })

  test('Should return ids declared using the longhand syntax as completion after "xref:" from other document', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from('xref:'),
    )
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldAppearInAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAppearInAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileThatShouldAppearInAutoComplete,
      Buffer.from('[id=longHandID]\nSome text.'),
    )
    createdFiles.push(fileThatShouldAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(0, 5),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) =>
        completionItem.label === 'fileToAppearInAutoComplete.adoc#longHandID[]',
    )
    assert.deepStrictEqual(
      filteredCompletionItems[0],
      new vscode.CompletionItem(
        'fileToAppearInAutoComplete.adoc#longHandID[]',
        vscode.CompletionItemKind.Reference,
      ),
    )
  })

  test('Should return ids declared using the longhand syntax as completion after "xref:" from same document', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToAutoCompleteFromSameFile.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from(`[id=longHandID]

xref:`),
    )
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(2, 5),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) => completionItem.label === 'longHandID[]',
    )
    assert.deepStrictEqual(
      filteredCompletionItems[0],
      new vscode.CompletionItem(
        'longHandID[]',
        vscode.CompletionItemKind.Reference,
      ),
    )
  })

  test('Should return id for inlined anchor', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToTestXrefAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from(`* [[anInlinedAnchor]]demo

xref:`),
    )
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(2, 5),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) => completionItem.label === 'anInlinedAnchor[]',
    )
    assert.deepStrictEqual(
      filteredCompletionItems[0],
      new vscode.CompletionItem(
        'anInlinedAnchor[]',
        vscode.CompletionItemKind.Reference,
      ),
    )
  })

  test('Should return id for element in same document after <<', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToTestXrefAliasAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from(`[#anIDFromSameFile]

<<`),
    )
    createdFiles.push(fileToAutoComplete)

    const fileThatShouldntAppearInAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileToNotAppearInAutoComplete.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileThatShouldntAppearInAutoComplete,
      Buffer.from('[#shouldNotAppear]'),
    )
    createdFiles.push(fileThatShouldntAppearInAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(2, 2),
    )
    const filteredCompletionItems = completionsItems.filter(
      (completionItem) => completionItem.label === 'anIDFromSameFile',
    )
    assert.deepStrictEqual(filteredCompletionItems[0], {
      kind: vscode.CompletionItemKind.Reference,
      label: 'anIDFromSameFile',
      insertText: 'anIDFromSameFile>>',
    })

    assert.strictEqual(
      completionsItems.filter(
        (completionItem) => completionItem.label === 'shouldNotAppear',
      ).length,
      0,
    )
  })

  test('Should suggest auto-generated section ids after "<<" (no explicit anchor)', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileWithSectionsForInternalRef.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from(`= Document

== Introduction

<<

== Conclusion
`),
    )
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(4, 2),
    )
    const labels = completionsItems.map(
      (completionItem) => completionItem.label,
    )
    assert.ok(
      labels.includes('_introduction'),
      `expected _introduction, got: ${labels.join(', ')}`,
    )
    assert.ok(
      labels.includes('_conclusion'),
      `expected _conclusion, got: ${labels.join(', ')}`,
    )
  })

  test('Should suggest section ids after "xref:" with an empty target', async () => {
    const fileToAutoComplete = vscode.Uri.joinPath(
      workspaceUri,
      'fileWithSectionsForXref.adoc',
    )
    await vscode.workspace.fs.writeFile(
      fileToAutoComplete,
      Buffer.from(`= Document

== Getting Started

xref:
`),
    )
    createdFiles.push(fileToAutoComplete)

    const file = await vscode.workspace.openTextDocument(fileToAutoComplete)
    const completionsItems = await xrefProvider.provideCompletionItems(
      file,
      new Position(4, 5),
    )
    const labels = completionsItems.map(
      (completionItem) => completionItem.label,
    )
    assert.ok(
      labels.includes('_getting_started[]'),
      `expected _getting_started[], got: ${labels.join(', ')}`,
    )
  })
})
