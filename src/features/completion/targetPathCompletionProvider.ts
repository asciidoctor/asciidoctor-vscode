import ospath from 'node:path'
import * as vscode from 'vscode'
import {
  FileInfo,
  getChildrenOfPath,
  sortFilesAndDirectories,
} from '../../core/file.js'
import { getAntoraDocumentContext } from '../antora/antoraDocument.js'
import { AsciidocLoader } from '../asciidoctor/asciidocLoader.js'
import { createContext } from './createContext.js'

const macroWithTargetPathRx = /(include::|image::|image:)\S*/gi

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.bmp',
  '.webp',
  '.avif',
  '.ico',
  '.tif',
  '.tiff',
])

function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(ospath.extname(fileName).toLowerCase())
}

export class TargetPathCompletionProvider {
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  async provideCompletionItems(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const context = createContext(textDocument, position)

    let textLine = context.textFullLine
    const prevWhitespace = textLine.lastIndexOf(' ', context.position.character)
    if (prevWhitespace !== -1) {
      textLine = textLine.substring(prevWhitespace + 1)
    }
    textLine = textLine.split(' ')[0]

    if (textLine.match(macroWithTargetPathRx)) {
      // On Antora pages, image/xref/include targets are resource ids, handled by
      // the Antora resource completion provider. File-system path completion does
      // not apply (images live under `modules/<module>/images`, not next to the
      // page) and would list irrelevant sibling files such as other pages.
      const antoraDocumentContext = await getAntoraDocumentContext(
        textDocument.uri,
        this.asciidocLoader.context.workspaceState,
      )
      if (antoraDocumentContext !== undefined) {
        return []
      }
      const documentText = context.document.getText()
      const pathExtractedFromMacroString = textLine
        .replace('include::', '')
        .replace('image::', '')
        .replace('image:', '')

      const hasBracket = pathExtractedFromMacroString.includes('[')

      let entryDir = pathExtractedFromMacroString
        .split('[')[0]
        .slice(0, pathExtractedFromMacroString.lastIndexOf('/'))

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
      if (textLine.includes('image:')) {
        const imagesDirValue = (
          await this.asciidocLoader.load(textDocument)
        ).getAttribute('imagesdir', '')
        if (imagesDirValue) {
          documentParentPath = ospath.join(
            documentParentPath,
            ospath.normalize(imagesDirValue),
          )
        }
      }
      const searchPath = ospath.join(documentParentPath, entryDir)
      const childrenOfPath = await getChildrenOfPath(searchPath)
      // An `image::` macro must only offer image files (directories are kept for
      // navigation); other files such as `.adoc` pages are irrelevant.
      const isImageMacro = textLine.includes('image:')
      const items = sortFilesAndDirectories(childrenOfPath).filter(
        (child) => !isImageMacro || !child.isFile || isImageFile(child.file),
      )
      const levelUpCompletionItem: vscode.CompletionItem = {
        label: '..',
        kind: vscode.CompletionItemKind.Folder,
        sortText: '10_..',
      }
      // TODO: we should use `document.getAttributes()` (and remove built-in / unnecessary / unrelated attributes)
      const globalVariableDefinitions = documentText.match(/:\S+:.*/g)

      let variablePathSubstitutions: vscode.CompletionItem[] = []
      // TODO: prevent editor.autoClosingBrackets at this point until finished inserting
      const editorConfig = vscode.workspace.getConfiguration('editor')
      const doAutoCloseBrackets =
        editorConfig.get('autoClosingBrackets') === 'always'
      if (globalVariableDefinitions) {
        variablePathSubstitutions = globalVariableDefinitions
          .map((variableDef) => {
            // variableDef itself matched `:\S+:.*`, so a `:\S+:` prefix match always exists.
            const label = variableDef.match(/:\S+:/g)![0].replace(/:/g, '')
            if (label !== 'imagesdir') {
              return {
                label: `{${label}}`,
                kind: vscode.CompletionItemKind.Variable,
                sortText: `10_${label}`,
                insertText: `{${label}${doAutoCloseBrackets ? '' : '}'}`, // } curly bracket will be closed automatically by default
              }
            }
            return undefined
          })
          .filter((e) => e !== undefined) // remove undefined
      }

      return [
        levelUpCompletionItem,
        ...variablePathSubstitutions,
        ...items.map((child) => {
          const result = createPathCompletionItem(child)
          result.insertText =
            result.kind === vscode.CompletionItemKind.File && !hasBracket
              ? child.file + '[]'
              : child.file
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

function createPathCompletionItem(fileInfo: FileInfo): vscode.CompletionItem {
  return {
    label: fileInfo.file,
    kind: fileInfo.isFile
      ? vscode.CompletionItemKind.File
      : vscode.CompletionItemKind.Folder,
    sortText: `10_${fileInfo.file}`,
  }
}
