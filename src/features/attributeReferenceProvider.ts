import * as vscode from 'vscode'

import { Asciidoctor } from '@asciidoctor/core'
import { AsciidocLoader } from '../asciidocLoader'

function findNearestBlock (document: Asciidoctor.Document, lineNumber: number) {
  let nearestBlock
  const blocks = document.findBy((block) => {
    const sourceLocation = block.getSourceLocation()
    if (sourceLocation) {
      if (sourceLocation.getLineNumber() === lineNumber) {
        return true
      } else if (sourceLocation.getLineNumber() < lineNumber) {
        nearestBlock = block
      }
    }
    return false
  })
  if (blocks && blocks.length) {
    return blocks[0]
  }
  return nearestBlock
}

export class AttributeReferenceProvider {
  constructor (private readonly asciidocLoader: AsciidocLoader) {}

  async provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    const document = await this.asciidocLoader.load(textDocument)
    const attributes = document.getAttributes()
    const lineText = textDocument.lineAt(position).text
    const nearestBlock = findNearestBlock(document, position.line + 1) // 0-based on VS code but 1-based on Asciidoctor (hence the + 1)
    if (nearestBlock && nearestBlock.content_model === 'verbatim' && !nearestBlock.getSubstitutions().includes('attributes')) {
      // verbatim block without attributes subs should not provide attributes completion
      return []
    }
    const prefix = lineText.substring(position.character - 1, position.character)
    const suffix = lineText.substring(position.character, position.character + 1)
    return Object.keys(attributes).map((key) => {
      const completionItem = new vscode.CompletionItem({
        label: key,
        description: attributes[key]?.toString(),
      },
      vscode.CompletionItemKind.Variable)
      let insertText = key
      insertText = prefix !== '{' ? `{${insertText}` : insertText
      insertText = suffix !== '}' ? `${insertText}}` : insertText
      completionItem.insertText = insertText
      completionItem.sortText = `20_${key}`
      completionItem.filterText = key + ' ' + attributes[key]?.toString()
      return completionItem
    })
  }
}
