import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import * as vscode from 'vscode'
import { createFile, removeFiles } from './workspaceHelper.js'

async function sectionTitles(documentUri: vscode.Uri): Promise<string[]> {
  const symbols = (await vscode.commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    documentUri,
  )) as vscode.DocumentSymbol[]
  return symbols.flatMap((symbol) => [
    symbol.name,
    ...symbol.children.map((child) => child.name),
  ])
}

// The parse of a document is shared and reused until the document changes or
// a file is saved in VS Code (#1251): an included file changed outside VS Code
// is only taken into account after the `asciidoc.clearCache` command.
describe('asciidoc.clearCache', () => {
  let createdFiles: vscode.Uri[] = []
  afterEach(async () => {
    await removeFiles(createdFiles)
    createdFiles = []
  })

  test('takes into account an included file changed outside VS Code', async () => {
    const partial = await createFile('== Before\n', 'clear-cache-partial.adoc')
    createdFiles.push(partial)
    const main = await createFile(
      '= Guide\n\ninclude::clear-cache-partial.adoc[]\n',
      'clear-cache-main.adoc',
    )
    createdFiles.push(main)
    await vscode.workspace.openTextDocument(main)
    assert.deepStrictEqual(await sectionTitles(main), ['Guide', 'Before'])

    // Written through the file system, not saved from an editor: VS Code does
    // not notify the extension, as for a change made by another program.
    await vscode.workspace.fs.writeFile(partial, Buffer.from('== After\n'))
    assert.deepStrictEqual(
      await sectionTitles(main),
      ['Guide', 'Before'],
      'the parse of the unchanged document should be reused',
    )

    await vscode.commands.executeCommand('asciidoc.clearCache')
    assert.deepStrictEqual(await sectionTitles(main), ['Guide', 'After'])
  })
})
