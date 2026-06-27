import * as vscode from 'vscode'
import { FoldingRangeKind } from 'vscode'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import { FoldKind, getBlockFoldingRanges } from './foldingRanges.js'
import { TableOfContentsProvider } from './tableOfContentsProvider.js'

//https://github.com/asciidoctor/asciidoctor/blob/0aad7459d1fe548219733b4a2b4f00fd3bf6f362/lib/asciidoctor/rx.rb#L76
const conditionalStartRx =
  /^(\\)?(ifdef|ifndef|ifeval)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/
const conditionalEndRx = /^(\\)?(endif)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/

export default class AsciidocFoldingRangeProvider
  implements vscode.FoldingRangeProvider
{
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  public async provideFoldingRanges(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.FoldingRange[]> {
    const foldingRanges = await this.getHeaderFoldingRanges(document)
    return foldingRanges.concat(
      AsciidocFoldingRangeProvider.getConditionalFoldingRanges(document),
      AsciidocFoldingRangeProvider.getBlockFoldingRanges(document),
    )
  }

  private static getConditionalFoldingRanges(document: vscode.TextDocument) {
    const conditionalStartIndexes = []
    const foldingRanges = []
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const line = document.lineAt(lineIndex)
      if (conditionalStartRx.test(line.text)) {
        conditionalStartIndexes.push(lineIndex)
      }
      if (conditionalEndRx.test(line.text)) {
        const startIndex = conditionalStartIndexes.pop()
        if (typeof startIndex !== 'undefined') {
          foldingRanges.push(
            new vscode.FoldingRange(
              startIndex,
              lineIndex,
              FoldingRangeKind.Region,
            ),
          )
        }
      }
    }
    return foldingRanges
  }

  /**
   * Fold delimited blocks (example, listing, literal, sidebar, quote,
   * passthrough, comment, open and table) as well as runs of single-line
   * comments (`//`) and document attributes (`:`). The line-scanning logic
   * lives in the VS Code-independent `foldingRanges` module; this only maps the
   * results onto `vscode.FoldingRange`.
   */
  private static getBlockFoldingRanges(
    document: vscode.TextDocument,
  ): vscode.FoldingRange[] {
    const lines: string[] = []
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      lines.push(document.lineAt(lineIndex).text)
    }
    return getBlockFoldingRanges(lines).map(
      (range) =>
        new vscode.FoldingRange(
          range.start,
          range.end,
          range.kind === FoldKind.Comment
            ? FoldingRangeKind.Comment
            : FoldingRangeKind.Region,
        ),
    )
  }

  private async getHeaderFoldingRanges(document: vscode.TextDocument) {
    const tableOfContentsProvider = new TableOfContentsProvider(
      document,
      this.asciidocLoader,
    )
    const tableOfContents = await tableOfContentsProvider.getToc()

    return tableOfContents.map((entry, startIndex) => {
      const start = entry.line
      let end: number | undefined
      for (let i = startIndex + 1; i < tableOfContents.length; ++i) {
        if (tableOfContents[i].level <= entry.level) {
          end = tableOfContents[i].line - 1
          break
        }
      }
      const endLine = typeof end === 'number' ? end : document.lineCount - 1
      // Included sections are anchored to their `include::` directive line, so
      // consecutive entries can share a line; never fold a range that ends
      // before it starts.
      return new vscode.FoldingRange(
        start,
        Math.max(start, endLine),
        FoldingRangeKind.Region,
      )
    })
  }
}
