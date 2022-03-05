import * as vscode from 'vscode'

import { AsciidocParser } from '../asciidocParser'

export class AttributeReferenceProvider {
  constructor (private readonly extensionUri: vscode.Uri) {
  }

  async provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position) {
    const { document } = await new AsciidocParser(this.extensionUri).parseText(textDocument.getText(), textDocument)
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
    }
    )
  }
}
