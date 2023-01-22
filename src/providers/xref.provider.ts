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

async function getLabelsFromAllWorkspaceFiles (): Promise<string[]> {
  const files = await vscode.workspace.findFiles('**/*.adoc')
  return await getLabelsFromFiles(files)
}

async function getLabelsFromFiles (files: vscode.Uri[]) {
  let contentOfFilesConcatenated = ''
  for (const uri of files) {
    const data = await vscode.workspace.fs.readFile(uri)
    contentOfFilesConcatenated += Buffer.from(data).toString('utf8') + '\n'
  }
  const labelsFromLegacyBlock = await getLabelsFromLegacyBlock(contentOfFilesConcatenated)
  const labelsFromShorthandNotation = await getLabelsFromShorthandNotation(contentOfFilesConcatenated)
  const labelsFromLonghandNotation = await getLabelsFromLonghandNotation(contentOfFilesConcatenated)
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
  const xrefLabels = await getLabelsFromAllWorkspaceFiles()

  return xrefLabels
    .filter((label) => label.match(search))
    .map((label) => ({
      label: `${label}[]`,
      kind: vscode.CompletionItemKind.Reference,
    }))
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

  const files :vscode.Uri[] = []
  files.push(document.uri)
  const internalRefLabels = await getLabelsFromFiles(files)

  return internalRefLabels
    .filter((label) => label.match(search))
    .map((label) => ({
      label: `${label}`,
      kind: vscode.CompletionItemKind.Reference,
      insertText: `${label}>>`,
    }))
}
