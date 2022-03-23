/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { FoldingRangeKind } from 'vscode'

import { AsciidocEngine } from '../asciidocEngine'
import { TableOfContentsProvider } from '../tableOfContentsProvider'

//https://github.com/asciidoctor/asciidoctor/blob/0aad7459d1fe548219733b4a2b4f00fd3bf6f362/lib/asciidoctor/rx.rb#L76
const conditionalStartRx = /^(\\)?(ifdef|ifndef|ifeval)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/
const conditionalEndRx = /^(\\)?(endif)::(\S*?(?:([,+])\S*?)?)\[(#{CC_ANY}+)?/

export default class AsciidocFoldingRangeProvider implements vscode.FoldingRangeProvider {
  constructor (
    private readonly engine: AsciidocEngine
  ) {
  }

  public provideFoldingRanges (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.FoldingRange[] {
    const foldingRanges = this.getHeaderFoldingRanges(document)
    return foldingRanges.concat(AsciidocFoldingRangeProvider.getConditionalFoldingRanges(document))
  }

  private static getConditionalFoldingRanges (document: vscode.TextDocument) {
    const conditionalStartIndexes = []
    const listOfRanges = []
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const line = document.lineAt(lineIndex)
      if (conditionalStartRx.test(line.text)) {
        conditionalStartIndexes.push(lineIndex)
      }
      if (conditionalEndRx.test(line.text)) {
        const startIndex = conditionalStartIndexes.pop()
        if (typeof startIndex !== 'undefined') {
          listOfRanges.push(new vscode.FoldingRange(
            startIndex,
            lineIndex,
            FoldingRangeKind.Region)
          )
        }
      }
    }
    return listOfRanges
  }

  private getHeaderFoldingRanges (document: vscode.TextDocument) {
    const tableOfContentsProvider = new TableOfContentsProvider(this.engine, document)
    const tableOfContents = tableOfContentsProvider.getToc()

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
