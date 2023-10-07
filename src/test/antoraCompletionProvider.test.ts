import 'mocha'
import * as vscode from 'vscode'
import assert from 'assert'
import AntoraCompletionProvider from '../features/antora/antoraCompletionProvider'
import { Position } from 'vscode'
import { getDefaultWorkspaceFolderUri } from '../util/workspace'

let workspaceUri

suite('Antora CompletionsProvider', () => {
  setup(() => {
    workspaceUri = getDefaultWorkspaceFolderUri()
  })
  test('Should return completion items', async () => {
    const provider = new AntoraCompletionProvider()
    const file = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspaceUri, 'antora', 'multiComponents', 'api', 'modules', 'auth', 'pages', 'jwt', 'page2.adoc'))
    const completionsItems = await provider.provideCompletionItems(file, new Position(3, 1))
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
  })
})
