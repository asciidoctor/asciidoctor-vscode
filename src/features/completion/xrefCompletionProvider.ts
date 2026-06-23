import * as path from 'node:path'
import * as vscode from 'vscode'
import { findFiles } from '../../core/findFiles.js'
import { getAntoraDocumentContext } from '../antora/antoraDocument.js'
import { Context, createContext } from './createContext.js'
import { getIdsFromContent } from './xrefIdExtractor.js'

/**
 * Completes `xref:` cross references (to files and their anchors) and `<<`
 * internal references. On Antora pages, cross references use resource ids
 * resolved against the content catalog, so the workspace-wide file-path
 * suggestions produced here are noise; the `AntoraResourceCompletionProvider`
 * takes over the `xref:` macro instead.
 */
export class XrefCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly workspaceState: vscode.Memento) {}

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const context = createContext(document, position)
    if (shouldProvide(context, 'xref:')) {
      const antoraDocumentContext = await getAntoraDocumentContext(
        document.uri,
        this.workspaceState,
      )
      if (antoraDocumentContext !== undefined) {
        return []
      }
      return provideCrossRef(context)
    } else if (shouldProvide(context, '<<')) {
      return provideInternalRef(context)
    } else {
      return []
    }
  }
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide(context: Context, keyword: string): boolean {
  const occurrence = context.textFullLine.indexOf(
    keyword,
    context.position.character - keyword.length,
  )
  return occurrence === context.position.character - keyword.length
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
  const { textFullLine, position } = context

  let textLine = textFullLine.substring(position.character)
  textLine = textLine.split(' ')[0]
  const search = textLine.split('[')[0]
  const hasBracket = textLine.includes('[')

  const completionItems: vscode.CompletionItem[] = []
  const workspacesAdocFiles = await findFiles('**/*.adoc')
  for (const adocFile of workspacesAdocFiles) {
    const labels = await getIdsFromFile(adocFile)
    for (const label of labels) {
      if (!search || label.match(search)) {
        const labelText = hasBracket ? label : label + '[]'
        if (adocFile.fsPath === context.document.uri.fsPath) {
          completionItems.push(
            new vscode.CompletionItem(
              labelText,
              vscode.CompletionItemKind.Reference,
            ),
          )
        } else {
          const relativePath =
            path.relative(
              path.dirname(context.document.uri.fsPath),
              adocFile.fsPath,
            ) +
            '#' +
            labelText
          completionItems.push(
            new vscode.CompletionItem(
              relativePath,
              vscode.CompletionItemKind.Reference,
            ),
          )
        }
      }
    }
  }

  return completionItems
}

async function provideInternalRef(
  context: Context,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const indexOfNextWhiteSpace = textFullLine.includes(' ', position.character)
    ? textFullLine.indexOf(' ', position.character)
    : textFullLine.length
  const search = textFullLine.substring(
    textFullLine.lastIndexOf('<', position.character + 1) + 1,
    indexOfNextWhiteSpace,
  )

  const internalRefLabels = await getIdsFromFile(document.uri)

  return internalRefLabels
    .filter((label) => label.match(search))
    .map((label) => ({
      label: `${label}`,
      kind: vscode.CompletionItemKind.Reference,
      insertText: `${label}>>`,
    }))
}
