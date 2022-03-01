import * as vscode from 'vscode'
import * as path from 'path'
import { createContext, Context } from './createContext'
import {
  FileInfo,
  getPathOfFolderToLookupFiles,
  getChildrenOfPath,
  sortFilesAndDirectories,
} from '../util/file'

export const AsciidocProvider = {
  provideCompletionItems,
}

export async function provideCompletionItems (
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<vscode.CompletionItem[]> {
  const context = createContext(document, position)

  return shouldProvide(context)
    ? provide(context)
    : Promise.resolve([])
}

/**
 * Checks if we should provide any CompletionItems
 * @param context
 */
function shouldProvide (context: Context): boolean {
  return /(include::|image::|image:)\S*/gi.test(context.textFullLine)
}

/**
 * Provide Completion Items
 */
async function provide (
  context: Context
): Promise<vscode.CompletionItem[]> {
  const documentText = context.document.getText()
  const pathExtractedFromIncludeString = context.textFullLine.replace('include::', '').replace('image::', '').replace('image:', '')
  let entryDir = pathExtractedFromIncludeString.substr(0, pathExtractedFromIncludeString.lastIndexOf('/'))

  // use path defined in a variable used
  if (entryDir.startsWith('{')) {
    const variableName = entryDir.replace('{', '').replace('}', '')
    const match = documentText.match(new RegExp(`:${variableName}:.*`, 'g'))
    if (match && match[0]) {
      entryDir = match[0].replace(`:${variableName}: `, '')
    }
  }

  const workspace = vscode.workspace.getWorkspaceFolder(context.document.uri)
  const rootPath = workspace?.uri.fsPath
  const searchPath = getPathOfFolderToLookupFiles(
    context.document.uri.fsPath,
    path.join(rootPath, entryDir)
  )

  const childrenOfPath = await getChildrenOfPath(searchPath)

  const items = sortFilesAndDirectories(childrenOfPath)

  const levelUpCompletionItem: vscode.CompletionItem = {
    label: '..',
    kind: vscode.CompletionItemKind.Folder,
    sortText: '..',
  }
  const globalVariableDefinitions = documentText.match(/:\S+:.*/g)

  let variablePathSubstitutions = []
  // TODO: prevent editor.autoClosingBrackets at this point until finished inserting
  const editorConfig = vscode.workspace.getConfiguration('editor')
  const doAutoCloseBrackets = editorConfig.get('autoClosingBrackets') === 'always'
  if (globalVariableDefinitions) {
    variablePathSubstitutions = globalVariableDefinitions.map((variableDef) => {
      const label = variableDef.match(/:\S+:/g)[0].replace(/:/g, '')
      return {
        label: `{${label}}`,
        kind: vscode.CompletionItemKind.Variable,
        sortText: `a_${label}`,
        insertText: `{${label}${doAutoCloseBrackets ? '' : '}'}`, // } curly bracket will be closed automatically by default
      }
    })
  }

  return [
    levelUpCompletionItem,
    ...variablePathSubstitutions,
    ...items.map((child) => {
      const result = createPathCompletionItem(child)
      result.insertText = result.kind === vscode.CompletionItemKind.File ? child.file + '[]' : child.file
      if (result.kind === vscode.CompletionItemKind.Folder) {
        result.command = {
          command: 'default:type',
          title: 'triggerSuggest',
          arguments: [{ text: '/' }],
        }
      }
      return result
    }),
  ]
}

function createPathCompletionItem (
  fileInfo: FileInfo
): vscode.CompletionItem {
  return {
    label: fileInfo.file,
    kind: fileInfo.isFile ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder,
    sortText: fileInfo.file,
  }
}
