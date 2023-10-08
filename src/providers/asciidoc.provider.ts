import * as vscode from 'vscode'
import ospath from 'path'
import { createContext } from './createContext'
import {
  FileInfo,
  getChildrenOfPath,
  sortFilesAndDirectories,
} from '../util/file'
import { AsciidocLoader } from '../asciidocLoader'

const macroWithTargetPathRx = /(include::|image::|image:)\S*/gi

export class TargetPathCompletionProvider {
  constructor (private readonly asciidocLoader: AsciidocLoader) {
  }

  async provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    const context = createContext(textDocument, position)
    if (macroWithTargetPathRx.test(context.textFullLine)) {
      const documentText = context.document.getText()
      const pathExtractedFromMacroString = context.textFullLine.replace('include::', '').replace('image::', '').replace('image:', '')
      let entryDir = pathExtractedFromMacroString.slice(0, pathExtractedFromMacroString.lastIndexOf('/'))

      // use path defined in a variable used
      if (entryDir.startsWith('{')) {
        const variableName = entryDir.replace('{', '').replace('}', '')
        const match = documentText.match(new RegExp(`:${variableName}:.*`, 'g'))
        if (match && match[0]) {
          entryDir = match[0].replace(`:${variableName}: `, '')
        }
      }

      const documentPath = context.document.uri.fsPath
      let documentParentPath = ospath.dirname(documentPath)
      if (context.textFullLine.includes('image:')) {
        const imagesDirValue = (await this.asciidocLoader.load(textDocument)).getAttribute('imagesdir', '')
        if (imagesDirValue) {
          documentParentPath = ospath.join(documentParentPath, ospath.normalize(imagesDirValue))
        }
      }
      const searchPath = ospath.join(documentParentPath, entryDir)
      const childrenOfPath = await getChildrenOfPath(searchPath)
      const items = sortFilesAndDirectories(childrenOfPath)
      const levelUpCompletionItem: vscode.CompletionItem = {
        label: '..',
        kind: vscode.CompletionItemKind.Folder,
        sortText: '10_..',
      }
      // TODO: we should use `document.getAttributes()` (and remove built-in / unnecessary / unrelated attributes)
      const globalVariableDefinitions = documentText.match(/:\S+:.*/g)

      let variablePathSubstitutions = []
      // TODO: prevent editor.autoClosingBrackets at this point until finished inserting
      const editorConfig = vscode.workspace.getConfiguration('editor')
      const doAutoCloseBrackets = editorConfig.get('autoClosingBrackets') === 'always'
      if (globalVariableDefinitions) {
        variablePathSubstitutions = globalVariableDefinitions.map((variableDef) => {
          const label = variableDef.match(/:\S+:/g)[0].replace(/:/g, '')
          if (label !== 'imagesdir') {
            return {
              label: `{${label}}`,
              kind: vscode.CompletionItemKind.Variable,
              sortText: `10_${label}`,
              insertText: `{${label}${doAutoCloseBrackets ? '' : '}'}`, // } curly bracket will be closed automatically by default
            }
          }
          return undefined
        }).filter((e) => e) // remove undefined
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
    return []
  }
}

function createPathCompletionItem (
  fileInfo: FileInfo
): vscode.CompletionItem {
  return {
    label: fileInfo.file,
    kind: fileInfo.isFile ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder,
    sortText: `10_${fileInfo.file}`,
  }
}
