import * as path from 'path'
import * as vscode from 'vscode'
import { findFiles } from '../util/findFiles'
import { Context, createContext } from './createContext'

export const xrefProvider = {
  provideCompletionItems,
}

export async function provideCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
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
  const labelsFromLegacyBlock = await getLabelsFromLegacyBlock(content)
  const labelsFromShorthandNotation =
    await getLabelsFromShorthandNotation(content)
  const labelsFromLonghandNotation =
    await getLabelsFromLonghandNotation(content)
  return labelsFromLegacyBlock.concat(
    labelsFromShorthandNotation,
    labelsFromLonghandNotation,
  )
}

async function getLabelsFromLonghandNotation(
  content: string,
): Promise<string[]> {
  const regex = /\[id=(\w+)\]/g
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace('[id=', '').replace(']', ''))
  }
  return []
}

async function getLabelsFromShorthandNotation(
  content: string,
): Promise<string[]> {
  const regex = /\[#(\w+)\]/g
  const matched = content.match(regex)
  if (matched) {
    return matched.map((result) => result.replace('[#', '').replace(']', ''))
  }
  return []
}

async function getLabelsFromLegacyBlock(content: string): Promise<string[]> {
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
async function provideCrossRef(
  context: Context,
): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position } = context

  let textLine = textFullLine.substring(position.character)
  textLine = textLine.split(' ')[0]
  let search = textLine.split('[')[0]
  let hasBracket = textLine.includes('[')

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
