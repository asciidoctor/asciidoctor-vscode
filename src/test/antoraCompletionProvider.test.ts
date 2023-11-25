import 'mocha'
import * as vscode from 'vscode'
import assert from 'assert'
import AntoraCompletionProvider from '../features/antora/antoraCompletionProvider'
import { Position } from 'vscode'
import { createDirectory, createFile, disableAntoraSupport, enableAntoraSupport, removeFiles } from './workspaceHelper'

suite('Antora CompletionsProvider', () => {
  const createdFiles: vscode.Uri[] = []
  suiteSetup(async () => {
    createdFiles.push(await createDirectory('docs'))
    await createFile(`name: "api"
version: "1.0"
title: Antora
asciidoc:
  attributes:
    source-language: asciidoc@
    xrefstyle: short@
    example-caption: false
`, 'docs', 'api', 'antora.yml')

    createdFiles.push(await createFile('', 'help.adoc'))
    const asciidocFile = await createFile(`image::images/ocean/waves/seaswell.png[]

image::images/mountain.jpeg[]

link:help.adoc[]
`, 'asciidoctorWebViewConverterTest.adoc')
    createdFiles.push(asciidocFile)
  })
  suiteTeardown(async () => {
    await removeFiles(createdFiles)
  })
  test('Should return completion items', async () => {
    try {
      const provider = new AntoraCompletionProvider()
      const file = await createFile(`= JWT Token

`, 'docs', 'api', 'modules', 'auth', 'pages', 'jwt', 'index.adoc')
      const textDocument = await vscode.workspace.openTextDocument(file)
      await enableAntoraSupport()
      const completionsItems = await provider.provideCompletionItems(textDocument, new Position(2, 1))
      assert.deepStrictEqual(completionsItems[0].label, {
        description: 'asciidoc@',
        label: 'source-language',
      })
      assert.strictEqual(completionsItems[0].insertText, '{asciidoc@}')
      assert.deepStrictEqual(completionsItems[1].label, {
        description: 'short@',
        label: 'xrefstyle',
      })
      assert.strictEqual(completionsItems[1].insertText, '{short@}')
      assert.deepStrictEqual(completionsItems[2].label, {
        description: false,
        label: 'example-caption',

      })
      assert.strictEqual(completionsItems[2].insertText, '{false}')
    } finally {
      await disableAntoraSupport()
    }
  })
})
