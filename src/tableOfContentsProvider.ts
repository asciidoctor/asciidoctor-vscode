/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocEngine } from './asciidocEngine'
import { githubSlugifier, Slug } from './slugify'
import { SkinnyTextDocument } from './util/document'

export interface TocEntry {
  readonly slug: Slug;
  readonly text: string;
  readonly level: number;
  readonly line: number;
  readonly location: vscode.Location;
}

export class TableOfContentsProvider {
  private toc?: TocEntry[]

  public constructor (private engine: AsciidocEngine, private document: SkinnyTextDocument) {
    this.engine = engine
    this.document = document
  }

  public async getToc (): Promise<TocEntry[]> {
    if (!this.toc) {
      try {
        this.toc = await this.buildToc(this.document)
      } catch (e) {
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
    const asciidocDocument = await this.engine.load(textDocument.uri)

    const toc = asciidocDocument
      .findBy({ context: 'section' })
      .map((section) => ({
        slug: new Slug(section.getId()),
        text: section.getTitle(),
        level: section.getLevel(),
        line: section.getLineNumber() - 1,
        location: new vscode.Location(textDocument.uri,
          new vscode.Position(section.getLineNumber() - 1, 1)),
      }))

    // Get full range of section
    return toc.map((entry, startIndex): TocEntry => {
      let end: number | undefined
      for (let i = startIndex + 1; i < toc.length; ++i) {
        if (toc[i].level <= entry.level) {
          end = toc[i].line - 1
          break
        }
      }
      const endLine = typeof end === 'number' ? end : textDocument.lineCount - 1
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
