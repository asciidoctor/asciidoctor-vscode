/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine'
import { TableOfContentsProvider, TocEntry } from '../tableOfContentsProvider'
import { SkinnyTextDocument } from '../util/document'

interface AsciidocSymbol {
  readonly level: number;
  readonly parent: AsciidocSymbol | undefined;
  readonly children: vscode.DocumentSymbol[];
}

export default class AdocDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private lastSymbolCall: number
  private lastRunTime: number = 1000
  private RunTimeFactor: number = 1.5

  constructor (private readonly engine: AsciidocEngine, private root: AsciidocSymbol = {
    level: -Infinity,
    children: [],
    parent: undefined,
  }) {
    this.engine = engine
    this.root = root
  }

  public async provideDocumentSymbolInformation (document: SkinnyTextDocument): Promise<vscode.SymbolInformation[]> {
    const toc = await new TableOfContentsProvider(this.engine, document).getToc()
    return toc.map((entry) => this.toSymbolInformation(entry))
  }

  public async provideDocumentSymbols (document: SkinnyTextDocument): Promise<vscode.DocumentSymbol[]> {
    const nextOKRunTime = this.lastSymbolCall + Math.max(this.lastRunTime * this.RunTimeFactor, 2000)
    const startTime = (new Date()).getTime()

    if (this.lastSymbolCall === undefined || startTime > nextOKRunTime) {
      const toc = await new TableOfContentsProvider(this.engine, document).getToc()
      this.root = {
        level: -Infinity,
        children: [],
        parent: undefined,
      }
      this.buildTree(this.root, toc)

      this.lastSymbolCall = (new Date()).getTime()
      this.lastRunTime = this.lastSymbolCall - startTime
    }

    return this.root.children
  }

  private buildTree (parent: AsciidocSymbol, entries: TocEntry[]) {
    if (!entries.length) {
      return
    }

    const entry = entries[0]
    const symbol = this.toDocumentSymbol(entry)
    symbol.children = []

    while (parent && entry.level <= parent.level) {
      parent = parent.parent!
    }
    parent.children.push(symbol)
    this.buildTree({ level: entry.level, children: symbol.children, parent }, entries.slice(1))
  }

  private toSymbolInformation (entry: TocEntry): vscode.SymbolInformation {
    return new vscode.SymbolInformation(
      entry.text,
      vscode.SymbolKind.String,
      '',
      entry.location)
  }

  private toDocumentSymbol (entry: TocEntry) {
    return new vscode.DocumentSymbol(
      entry.text,
      '',
      vscode.SymbolKind.String,
      entry.location.range,
      entry.location.range)
  }
}
