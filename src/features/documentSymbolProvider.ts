import * as vscode from 'vscode'
import { SkinnyTextDocument } from '../core/document.js'
import { AsciidocLoader } from './asciidoctor/asciidocLoader.js'
import { TableOfContentsProvider, TocEntry } from './tableOfContentsProvider.js'

interface AsciidocSymbol {
  readonly level: number
  readonly parent: AsciidocSymbol | undefined
  readonly children: vscode.DocumentSymbol[]
}

export default class AdocDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  constructor(private readonly asciidocLoader: AsciidocLoader) {}

  public async provideDocumentSymbolInformation(
    document: SkinnyTextDocument,
  ): Promise<vscode.SymbolInformation[]> {
    const toc = await new TableOfContentsProvider(
      document,
      this.asciidocLoader,
    ).getToc()
    return toc.map((entry) => this.toSymbolInformation(entry))
  }

  public async provideDocumentSymbols(
    document: SkinnyTextDocument,
  ): Promise<vscode.DocumentSymbol[]> {
    // Recompute on every request: the previous implementation cached the tree
    // on the (singleton) provider and only refreshed it after a 2s throttle,
    // which returned a stale — and across documents, wrong — outline. The
    // `TableOfContentsProvider` already parses once per request, like the
    // folding and link providers do.
    const toc = await new TableOfContentsProvider(
      document,
      this.asciidocLoader,
    ).getToc()
    const root: AsciidocSymbol = {
      level: -Infinity,
      children: [],
      parent: undefined,
    }
    this.buildTree(root, toc)
    return root.children
  }

  private buildTree(parent: AsciidocSymbol, entries: TocEntry[]) {
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
    this.buildTree(
      { level: entry.level, children: symbol.children, parent },
      entries.slice(1),
    )
  }

  private toSymbolInformation(entry: TocEntry): vscode.SymbolInformation {
    return new vscode.SymbolInformation(
      entry.text,
      vscode.SymbolKind.String,
      '',
      entry.location,
    )
  }

  private toDocumentSymbol(entry: TocEntry) {
    return new vscode.DocumentSymbol(
      entry.text,
      '',
      vscode.SymbolKind.String,
      entry.location.range,
      entry.location.range,
    )
  }
}
