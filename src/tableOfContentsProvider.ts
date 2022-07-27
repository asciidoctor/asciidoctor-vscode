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

  public constructor (private document: SkinnyTextDocument) {
    this.document = document
  }

  public getToc (): TocEntry[] {
    if (!this.toc) {
      try {
        this.toc = this.buildToc(this.document)
      } catch (e) {
        console.log(`Unable to build the Table Of Content for: ${this.document.fileName}`, e)
        this.toc = []
      }
    }
    return this.toc
  }

  public lookup (fragment: string): TocEntry | undefined {
    const toc = this.getToc()
    const slug = githubSlugifier.fromHeading(fragment)
    return toc.find((entry) => entry.slug.equals(slug))
  }

  private buildToc (textDocument: SkinnyTextDocument): TocEntry[] {
    const asciidocDocument = AsciidocEngine.load(textDocument)

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
