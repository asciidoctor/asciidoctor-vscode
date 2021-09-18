import * as vscode from 'vscode'
import { createContext, Context } from './createContext'
import { readFileSync } from 'fs'
const bibtexParse = require('@orcid/bibtex-parse-js')

export const BibtexProvider = {
  provideCompletionItems,
}

export async function provideCompletionItems (
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[]> {
  const context = createContext(document, position)

  return shouldProvide(context) ? provide(context) : Promise.resolve([])
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide (context: Context): boolean {
  const keyword = 'citenp:'
  // Check if cursor is after citenp:
  const occurence = context.textFullLine.indexOf(
    keyword,
    context.position.character - keyword.length
  )
  return occurence === context.position.character - keyword.length
}

async function getCitationKeys (): Promise<string[]> {
  const files = await vscode.workspace.findFiles('*.bib')
  const filesContent = files.map((file) =>
    readFileSync(file.path).toString('utf-8')
  )
  const bibtexJson = filesContent.map((content) => bibtexParse.toJSON(content))
  const flatMap = (f, xs) => xs.reduce((r, x) => r.concat(f(x)), [])
  return flatMap(
    (jsons) => jsons.map((entries) => entries.citationKey),
    bibtexJson
  )
}

/**
 * Provide Completion Items
 */
async function provide (context: Context): Promise<vscode.CompletionItem[]> {
  const { textFullLine, position } = context
  const indexOfNextWhiteSpace = textFullLine.includes(' ', position.character)
    ? textFullLine.indexOf(' ', position.character)
    : textFullLine.length
  //Find the text between citenp: and the next whitespace character
  const bibtexSearch = textFullLine.substring(
    textFullLine.lastIndexOf(':', position.character + 1) + 1,
    indexOfNextWhiteSpace
  )
  const citationKeys = await getCitationKeys()

  return citationKeys
    .filter((citationKeys) => citationKeys.match(bibtexSearch))
    .map((citationKey) => ({
      label: `[${citationKey}]`,
      kind: vscode.CompletionItemKind.Reference,
    }))
}
