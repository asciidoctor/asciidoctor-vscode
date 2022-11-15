import * as vscode from 'vscode'
import { getAttributes } from './antoraSupport'

export default class AntoraCompletionProvider {
  async provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    const lineText = textDocument.lineAt(position).text
    const prefix = lineText.substring(position.character - 1, position.character)
    const suffix = lineText.substring(position.character, position.character + 1)
    const attributes = await getAttributes(textDocument.uri)
    return Object.entries(attributes).map(([key, value]) => {
      const completionItem = new vscode.CompletionItem({
        label: key,
        description: value,
      }, vscode.CompletionItemKind.Text)
      let insertText = value
      insertText = prefix !== '{' ? `{${insertText}` : insertText
      insertText = suffix !== '}' ? `${insertText}}` : insertText
      completionItem.insertText = insertText
      return completionItem
    })
  }
}
