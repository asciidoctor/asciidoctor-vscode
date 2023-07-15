import * as vscode from 'vscode'
import { FoldingRangeKind } from 'vscode'

import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { AsciidocLoader } from '../asciidocLoader'

//https://github.com/asciidoctor/asciidoctor/blob/0aad7459d1fe548219733b4a2b4f00fd3bf6f362/lib/asciidoctor/rx.rb#L76
const conditionalStartRx = /^(\\)?(ifdef|ifndef|ifeval)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/
const conditionalEndRx = /^(\\)?(endif)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/
const commentBlockRx = /^\/{4,}/

export default class AsciidocFoldingRangeProvider implements vscode.FoldingRangeProvider {
  constructor (private readonly asciidocLoader: AsciidocLoader) {
  }

  public async provideFoldingRanges (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.FoldingRange[]> {
    const foldingRanges = await this.getHeaderFoldingRanges(document)
    return foldingRanges.concat(
      AsciidocFoldingRangeProvider.getConditionalFoldingRanges(document),
      AsciidocFoldingRangeProvider.getBlockFoldingRanges(document)
    )
  }

  private static getConditionalFoldingRanges (document: vscode.TextDocument) {
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
          foldingRanges.push(new vscode.FoldingRange(
            startIndex,
            lineIndex,
            FoldingRangeKind.Region)
          )
        }
      }
    }
    return foldingRanges
  }

  private static handleOpenBlockFoldingRanges (openBlockIndexes: any[], foldingRanges: any[], lineIndex: number, lineText: string, documentLineCount: number) {
    if (lineText === '--') {
      if (openBlockIndexes.length === 0) {
        openBlockIndexes.push(lineIndex)
      } else {
        const startIndex = openBlockIndexes.pop()
        foldingRanges.push(new vscode.FoldingRange(
          startIndex,
          lineIndex,
          FoldingRangeKind.Region)
        )
      }
    }
    if (openBlockIndexes.length === 1 && lineIndex === documentLineCount - 1) {
      // unterminated open block
      foldingRanges.push(new vscode.FoldingRange(
        openBlockIndexes.pop(),
        documentLineCount - 1,
        FoldingRangeKind.Region)
      )
    }
  }

  private static handleCommentBlockFoldingRanges (commentBlockIndexes: any[], foldingRanges: any[], lineIndex: number, lineText: string,
    documentLineCount: number) {
    if (commentBlockRx.test(lineText)) {
      if (commentBlockIndexes.length === 0) {
        commentBlockIndexes.push(lineIndex)
      } else {
        const startIndex = commentBlockIndexes.pop()
        foldingRanges.push(new vscode.FoldingRange(
          startIndex,
          lineIndex,
          FoldingRangeKind.Region)
        )
      }
    }
    if (commentBlockIndexes.length === 1 && lineIndex === documentLineCount - 1) {
      // unterminated comment block
      foldingRanges.push(new vscode.FoldingRange(
        commentBlockIndexes.pop(),
        documentLineCount - 1,
        FoldingRangeKind.Region)
      )
    }
  }

  private static handleSingleLineCommentFoldingRanges (singleLineCommentStartIndexes: any[], foldingRanges: any[], lineIndex: number, lineText: string,
    documentLineCount: number) {
    if (lineText.startsWith('//')) {
      if (singleLineCommentStartIndexes.length === 0) {
        singleLineCommentStartIndexes.push(lineIndex)
      }
      if (lineIndex >= documentLineCount - 1) {
        // comment on last line of the document
        const startIndex = singleLineCommentStartIndexes.pop()
        if (lineIndex > startIndex) {
          foldingRanges.push(new vscode.FoldingRange(
            startIndex,
            lineIndex,
            FoldingRangeKind.Comment)
          )
        }
      }
    } else {
      if (singleLineCommentStartIndexes.length !== 0) {
        const startIndex = singleLineCommentStartIndexes.pop()
        const endIndex = lineIndex - 1
        if (endIndex > startIndex) {
          foldingRanges.push(new vscode.FoldingRange(
            startIndex,
            endIndex,
            FoldingRangeKind.Comment))
        }
      }
    }
  }

  private static handleMultiAttributesFoldingRanges (multiAttributesIndexes: any[], foldingRanges: any[], lineIndex: number, lineText: string, documentLineCount: number) {
    if (lineText.startsWith(':')) {
      if (multiAttributesIndexes.length === 0) {
        multiAttributesIndexes.push(lineIndex)
      }
      if (lineIndex >= documentLineCount - 1) {
        // Attribute on last line of the document
        const startIndex = multiAttributesIndexes.pop()
        if (lineIndex > startIndex) {
          foldingRanges.push(new vscode.FoldingRange(
            startIndex,
            lineIndex)
          )
        }
      }
    } else {
      if (multiAttributesIndexes.length !== 0) {
        const startIndex = multiAttributesIndexes.pop()
        const endIndex = lineIndex - 1
        if (endIndex > startIndex) {
          foldingRanges.push(new vscode.FoldingRange(
            startIndex,
            endIndex))
        }
      }
    }
  }

  private static getBlockFoldingRanges (document: vscode.TextDocument) {
    const foldingRanges = []
    const openBlockIndexes = []
    const commentBlockIndexes = []
    const singleLineCommentStartIndexes = []
    const multiAttributesIndexes = []
    const documentLineCount = document.lineCount
    for (let lineIndex = 0; lineIndex < documentLineCount; lineIndex++) {
      const line = document.lineAt(lineIndex)
      const lineText = line.text
      this.handleOpenBlockFoldingRanges(openBlockIndexes, foldingRanges, lineIndex, lineText, documentLineCount)
      this.handleCommentBlockFoldingRanges(commentBlockIndexes, foldingRanges, lineIndex, lineText, documentLineCount)
      this.handleSingleLineCommentFoldingRanges(singleLineCommentStartIndexes, foldingRanges, lineIndex, lineText, documentLineCount)
      this.handleMultiAttributesFoldingRanges(multiAttributesIndexes, foldingRanges, lineIndex, lineText, documentLineCount)
    }
    return foldingRanges
  }

  private async getHeaderFoldingRanges (document: vscode.TextDocument) {
    const tableOfContentsProvider = new TableOfContentsProvider(document, this.asciidocLoader)
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
      return new vscode.FoldingRange(
        start,
        typeof end === 'number' ? end : document.lineCount - 1,
        FoldingRangeKind.Region)
    })
  }
}
