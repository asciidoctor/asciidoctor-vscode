import * as vscode from 'vscode'
import { decode as htmlEntitiesDecode } from 'html-entities'
import { githubSlugifier, Slug } from './slugify'
import { SkinnyTextDocument } from './util/document'
import { AsciidocLoader } from './asciidocLoader'

export interface TocEntry {
  readonly slug: Slug;
  readonly text: string;
  readonly level: number;
  readonly line: number;
  readonly location: vscode.Location;
}

export class TableOfContentsProvider {
  private toc?: TocEntry[]

  public constructor (private readonly document: SkinnyTextDocument, private readonly asciidocLoader: AsciidocLoader) {
    this.document = document
  }

  public async getToc (): Promise<TocEntry[]> {
    if (!this.toc) {
      try {
        this.toc = await this.buildToc(this.document)
      } catch (e) {
        console.log(`Unable to build the Table Of Content for: ${this.document.fileName}`, e)
        this.toc = []
      }
    }
    return this.toc
  }

  public async lookup (fragment: string): Promise<TocEntry | undefined> {
    const toc = await this.getToc()
    const slug = githubSlugifier.fromHeading(fragment)
    return toc.find((entry) => entry.slug.equals(slug))
  }

  private async buildToc (textDocument: SkinnyTextDocument): Promise<TocEntry[]> {
    const asciidocDocument = await this.asciidocLoader.load(textDocument)

    const toc = asciidocDocument
      .findBy({ context: 'section' })
      .map((section) => {
        let lineNumber = section.getLineNumber() // Asciidoctor is 1-based but can return 0 (probably a bug/limitation)
        if (lineNumber > 0) {
          lineNumber = lineNumber - 1
        }
        return {
          slug: new Slug(section.getId()),
          text: htmlEntitiesDecode(section.getTitle()),
          level: section.getLevel(),
          line: lineNumber,
          location: new vscode.Location(textDocument.uri,
            new vscode.Position(lineNumber, 1)),
        }
      })

    // Get full range of section
    return toc.map((entry, startIndex): TocEntry => {
      let end: number | undefined
      for (let i = startIndex + 1; i < toc.length; ++i) {
        if (toc[i].level <= entry.level) {
          end = toc[i].line - 1
          break
        }
      }
      let endLine = typeof end === 'number' ? end : textDocument.lineCount - 1
      if (endLine > textDocument.lineCount - 1) {
        endLine = textDocument.lineCount - 1
      }
      return {
        ...entry,
        location: new vscode.Location(textDocument.uri,
          new vscode.Range(
            entry.location.range.start,
            new vscode.Position(endLine, textDocument.lineAt(endLine).range.end.character))),
      }
    })
  }
}
