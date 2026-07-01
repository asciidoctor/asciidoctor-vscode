import * as vscode from 'vscode'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import { findNearestBlock } from './completion/attributeReferenceUtils.js'

// Attribute names are case-insensitive and may only contain word characters and
// hyphens, and must begin with a word character.
// https://docs.asciidoctor.org/asciidoc/latest/attributes/names-and-values/
const ATTRIBUTE_REFERENCE_RX = /\{([A-Za-z0-9_][A-Za-z0-9_-]*)\}/g

export class AttributeReferenceHoverProvider implements vscode.HoverProvider {
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  async provideHover(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const reference = this.findReferenceAt(textDocument, position)
    if (reference === undefined) {
      return undefined
    }
    const document = await this.asciidocLoader.load(textDocument)
    const nearestBlock = findNearestBlock(document, position.line + 1) // 0-based on VS Code but 1-based on Asciidoctor (hence the + 1)
    if (
      nearestBlock &&
      nearestBlock.getContentModel() === 'verbatim' &&
      !nearestBlock.getSubstitutions().includes('attributes')
    ) {
      // A verbatim block without the `attributes` substitution does not resolve
      // attribute references, so showing a value here would be misleading.
      return undefined
    }
    const attributes = document.getAttributes()
    // Asciidoctor stores attribute names lowercased.
    const name = reference.name.toLowerCase()
    // The document is parsed (`parse: true`) but never converted, and attribute
    // entries in the body are only applied during conversion — so
    // `getAttributes()` exposes ONLY the header/intrinsic/config attributes, not
    // anything declared after the header (including attributes coming from a
    // body-level include), nor any redefinition. Those references therefore show
    // "not set" here. Resolving them would require a positional scan of
    // attribute entries in document order (see the discussion in #729); this is
    // deliberately out of scope, matching the attribute-reference completion
    // provider.
    const contents = new vscode.MarkdownString()
    if (Object.hasOwn(attributes, name)) {
      const value = attributes[name]?.toString() ?? ''
      contents.appendCodeblock(`{${reference.name}} = ${value}`, 'asciidoc')
    } else {
      contents.appendMarkdown(
        `\`{${reference.name}}\` is not set in this document.`,
      )
    }
    return new vscode.Hover(contents, reference.range)
  }

  private findReferenceAt(
    textDocument: vscode.TextDocument,
    position: vscode.Position,
  ): { name: string; range: vscode.Range } | undefined {
    const lineText = textDocument.lineAt(position.line).text
    ATTRIBUTE_REFERENCE_RX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = ATTRIBUTE_REFERENCE_RX.exec(lineText)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (position.character >= start && position.character <= end) {
        return {
          name: match[1],
          range: new vscode.Range(
            new vscode.Position(position.line, start),
            new vscode.Position(position.line, end),
          ),
        }
      }
    }
    return undefined
  }
}
