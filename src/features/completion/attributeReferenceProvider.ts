import * as vscode from 'vscode'
import { logger } from '../../core/logger.js'
import { AsciidocLoader } from '../asciidoctor/asciidocLoader.js'
import { findNearestBlock } from './attributeReferenceUtils.js'

export class AttributeReferenceProvider {
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  async provideCompletionItems(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const lineText = textDocument.lineAt(position).text
    const linePrefix = lineText.substring(0, position.character)
    // Only complete attribute references, i.e. when the cursor is inside an
    // unclosed `{ ... }`. Suggesting every document attribute on any word is too
    // noisy (and pollutes macro targets such as `image::`).
    const openBraceIndex = linePrefix.lastIndexOf('{')
    if (
      openBraceIndex === -1 ||
      linePrefix.indexOf('}', openBraceIndex) !== -1
    ) {
      return []
    }
    const document = await this.asciidocLoader.load(textDocument)
    const attributes = document.getAttributes()
    const nearestBlock = findNearestBlock(
      document,
      position.line + 1, // 0-based on VS Code but 1-based on Asciidoctor (hence the + 1)
      (err) =>
        logger.error(
          'Attribute completion: skipping a block that could not be inspected',
          err,
        ),
    )
    if (
      nearestBlock &&
      nearestBlock.getContentModel() === 'verbatim' &&
      !nearestBlock.getSubstitutions().includes('attributes')
    ) {
      // verbatim block without attributes subs should not provide attributes completion
      return []
    }
    const suffix = lineText.substring(
      position.character,
      position.character + 1,
    )
    // Replace the `{`-prefixed text already typed so the brace is never doubled.
    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, openBraceIndex),
      position,
    )
    return Object.keys(attributes).map((key) => {
      const value = attributes[key]?.toString()
      const completionItem = new vscode.CompletionItem(
        {
          label: key,
          description: value,
        },
        vscode.CompletionItemKind.Variable,
      )
      completionItem.insertText = suffix === '}' ? `{${key}` : `{${key}}`
      completionItem.range = replaceRange
      completionItem.sortText = `20_${key}`
      completionItem.filterText = `{${key} ${value ?? ''}`
      return completionItem
    })
  }
}
