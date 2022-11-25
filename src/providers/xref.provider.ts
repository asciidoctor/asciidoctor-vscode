import * as path from 'path'
import * as vscode from 'vscode'
import { createContext, Context } from './createContext'

export const xrefProvider = {
  provideCompletionItems,
}

export async function provideCompletionItems (
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[]> {
  const context = createContext(document, position)
  if (shouldProvide(context, 'xref:')) {
    return provideCrossRef(context)
  } else if (shouldProvide(context, '<<')) {
    return provideInternalRef(context)
  } else {
    return Promise.resolve([])
  }
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide (context: Context, keyword :string): boolean {
  const occurence = context.textFullLine.indexOf(
    keyword,
    context.position.character - keyword.length
  )
  return occurence === context.position.character - keyword.length
}

async function getIdsFromFile (file: vscode.Uri) {
  const data = await vscode.workspace.fs.readFile(file)
  const content = Buffer.from(data).toString('utf8')
  const labelsFromLegacyBlock = await getLabelsFromLegacyBlock(content)
  const labelsFromShorthandNotation = await getLabelsFromShorthandNotation(content)
  const labelsFromLonghandNotation = await getLabelsFromLonghandNotation(content)
  return labelsFromLegacyBlock.concat(labelsFromShorthandNotation, labelsFromLonghandNotation)
}

async function getLabelsFromLonghandNotation (content: string): Promise<string[]> {
  const regex = /\[id=(\w+)\]/g
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace('[id=', '').replace(']', ''))
  }
  return []
}

async function getLabelsFromShorthandNotation (content: string): Promise<string[]> {
  const regex = /\[#(\w+)\]/g
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace('[#', '').replace(']', ''))
  }
  return []
}

async function getLabelsFromLegacyBlock (content: string): Promise<string[]> {
  const regex = /\[\[(\w+)\]\]/g
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace('[[', '').replace(']]', ''))
  }
  return []
}

/**
 * Provide Completion Items
 */
async function provideCrossRef (context: Context): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position } = context
  const indexOfNextWhiteSpace = textFullLine.includes(' ', position.character)
    ? textFullLine.indexOf(' ', position.character)
    : textFullLine.length
  //Find the text between citenp: and the next whitespace character
  const search = textFullLine.substring(
    textFullLine.lastIndexOf(':', position.character + 1) + 1,
    indexOfNextWhiteSpace
  )

  const completionItems: vscode.CompletionItem[] = []
  const workspacesAdocFiles = await vscode.workspace.findFiles('**/*.adoc')
  for (const adocFile of workspacesAdocFiles) {
    const labels = await getIdsFromFile(adocFile)
    for (const label of labels) {
      if (label.match(search)) {
        if (adocFile.fsPath === context.document.uri.fsPath) {
          completionItems.push(new vscode.CompletionItem(
            label + '[]',
            vscode.CompletionItemKind.Reference))
        } else {
          completionItems.push(new vscode.CompletionItem(
            path.relative(path.dirname(context.document.uri.fsPath), adocFile.fsPath) + '#' + label + '[]',
            vscode.CompletionItemKind.Reference))
        }
      }
    }
  }

  return completionItems
}

async function provideInternalRef (context: Context): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position, document } = context
  const indexOfNextWhiteSpace = textFullLine.includes(' ', position.character)
    ? textFullLine.indexOf(' ', position.character)
    : textFullLine.length
  const search = textFullLine.substring(
    textFullLine.lastIndexOf('<', position.character + 1) + 1,
    indexOfNextWhiteSpace
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
