import * as vscode from 'vscode'

import { AsciidocParser } from '../asciidocParser'

export class AttributeReferenceProvider {
  provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const { document } = AsciidocParser.load(textDocument)
    const attributes = document.getAttributes()
    const lineText = textDocument.lineAt(position).text
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
      return completionItem
    })
  }
}
