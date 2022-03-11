/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'

import { AsciidocEngine } from '../asciidocEngine'
import { TableOfContentsProvider } from '../tableOfContentsProvider'

export default class AsciidocFoldingRangeProvider implements vscode.FoldingRangeProvider {
  constructor (
    private readonly engine: AsciidocEngine
  ) {
  }

  public async provideFoldingRanges (
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.FoldingRange[]> {
    const tableOfContentsProvider = new TableOfContentsProvider(this.engine, document)
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
        typeof end === 'number' ? end : document.lineCount - 1)
    })
  }
}
