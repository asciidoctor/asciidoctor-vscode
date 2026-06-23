import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { getAntoraDocumentContext } from '../antora/antoraDocument.js'
import { Context, createContext } from './createContext.js'
import {
  buildCrossRefLabel,
  matchesCrossRefQuery,
  parseCrossRefQuery,
  parseInternalRefQuery,
  shouldProvideCompletion,
} from './xrefCompletion.js'
import { getIdsFromContent } from './xrefIdExtractor.js'

/**
 * Completes `xref:` cross references (to files and their anchors) and `<<`
 * internal references. On Antora pages, cross references use resource ids
 * resolved against the content catalog, so the workspace-wide file-path
 * suggestions produced here are noise; the `AntoraResourceCompletionProvider`
 * takes over the `xref:` macro instead.
 *
 * The string parsing is delegated to the `vscode`-free helpers in
 * `xrefCompletion`; this class only wires them to the editor.
 */
export class XrefCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly workspaceState: vscode.Memento) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const context = createContext(document, position)
    if (
      shouldProvideCompletion(context.textFullLine, position.character, 'xref:')
    ) {
      const antoraDocumentContext = await getAntoraDocumentContext(
        document.uri,
        this.workspaceState,
      )
      if (antoraDocumentContext !== undefined) {
        return []
      }
      return provideCrossRef(context)
    } else if (
      shouldProvideCompletion(context.textFullLine, position.character, '<<')
    ) {
      return provideInternalRef(context)
    } else {
      return []
    }
  }
}

async function getIdsFromFile(file: vscode.Uri) {
  const data = await vscode.workspace.fs.readFile(file)
  const content = Buffer.from(data).toString('utf8')
  return getIdsFromContent(content)
}

/**
 * Provide Completion Items
 */
async function provideCrossRef(
  context: Context,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const { search, hasBracket } = parseCrossRefQuery(
    textFullLine,
    position.character,
  )

  const completionItems: vscode.CompletionItem[] = []
  const workspacesAdocFiles = await findFiles('**/*.adoc')
  for (const adocFile of workspacesAdocFiles) {
    const labels = await getIdsFromFile(adocFile)
    for (const label of labels) {
      if (matchesCrossRefQuery(label, search)) {
        const labelText = buildCrossRefLabel(label, hasBracket, {
          currentFilePath: document.uri.fsPath,
          targetFilePath: adocFile.fsPath,
        })
        completionItems.push(
          new vscode.CompletionItem(
            labelText,
            vscode.CompletionItemKind.Reference,
          ),
        )
      }
    }
  }

  return completionItems
}

async function provideInternalRef(
  context: Context,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const search = parseInternalRefQuery(textFullLine, position.character)

  const internalRefLabels = await getIdsFromFile(document.uri)

  return internalRefLabels
    .filter((label) => label.match(search))
    .map((label) => ({
      label: `${label}`,
      kind: vscode.CompletionItemKind.Reference,
      insertText: `${label}>>`,
    }))
}
