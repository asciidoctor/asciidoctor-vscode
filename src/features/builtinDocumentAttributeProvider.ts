import * as vscode from 'vscode'
import builtinAttributes from './builtinDocumentAttribute.json'

export class BuiltinDocumentAttributeProvider {
  private readonly completionItems = Object.keys(builtinAttributes).map((key) => {
    const value = builtinAttributes[key]
    const completionItem = new vscode.CompletionItem({ label: value.label, description: value.description }, vscode.CompletionItemKind.Text)
    completionItem.insertText = new vscode.SnippetString(value.insertText)
    return completionItem
  })

  constructor (private readonly extensionUri: vscode.Uri) {
  }

  async provideCompletionItems (textDocument: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
    const linePrefix = textDocument.lineAt(position).text.substr(0, position.character)
    if (linePrefix !== ':') {
      return undefined
    }
    return this.completionItems
  }
}
