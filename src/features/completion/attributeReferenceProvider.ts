import * as vscode from 'vscode'
import { AsciidocLoader } from '../../asciidocLoader.js'
import { findNearestBlock } from './attributeReferenceUtils.js'

export class AttributeReferenceProvider {
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  async provideCompletionItems(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const document = await this.asciidocLoader.load(textDocument)
    const attributes = document.getAttributes()
    const lineText = textDocument.lineAt(position).text
    const nearestBlock = findNearestBlock(document, position.line + 1) // 0-based on VS code but 1-based on Asciidoctor (hence the + 1)
    if (
      nearestBlock &&
      nearestBlock.getContentModel() === 'verbatim' &&
      !nearestBlock.getSubstitutions().includes('attributes')
    ) {
      // verbatim block without attributes subs should not provide attributes completion
      return []
    }
    const prefix = lineText.substring(
      position.character - 1,
      position.character,
    )
    const suffix = lineText.substring(
      position.character,
      position.character + 1,
    )
    return Object.keys(attributes).map((key) => {
      const completionItem = new vscode.CompletionItem(
        {
          label: key,
          description: attributes[key]?.toString(),
        },
        vscode.CompletionItemKind.Variable,
      )
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
