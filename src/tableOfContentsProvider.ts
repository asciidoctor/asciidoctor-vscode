/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AsciidocEngine } from './asciidocEngine';
import { Slug, githubSlugifier } from './slugify';

export interface TocEntry {
	readonly slug: Slug;
	readonly text: string;
	readonly level: number;
	readonly line: number;
	readonly location: vscode.Location;
}

export interface SkinnyTextDocument {
	readonly uri: vscode.Uri;
	readonly lineCount: number;
	getText(): string;
	lineAt(line: number): vscode.TextLine;
}

export class TableOfContentsProvider {
	private toc?: TocEntry[];

	public constructor(
		private engine: AsciidocEngine,
		private document: SkinnyTextDocument
	) { }

	public async getToc(): Promise<TocEntry[]> {
	  if (!this.toc) {
	    try {
	      this.toc = await this.buildToc(this.document);
	    } catch (e) {
	      this.toc = [];
	    }
	  }
	  return this.toc;
	}

	public async lookup(fragment: string): Promise<TocEntry | undefined> {
	  const toc = await this.getToc();
	  const slug = githubSlugifier.fromHeading(fragment);
	  return toc.find((entry) => entry.slug.equals(slug));
	}

	private async buildToc(document: SkinnyTextDocument): Promise<TocEntry[]> {
	  let toc: TocEntry[] = [];
	  const adoc = await this.engine.parse(document.uri, document.getText());
		
	  adoc.findBy({ 'context': 'section' }, function (section) {
	    toc.push({
	      slug: section.getId(),
	      text: section.getTitle(),
	      level: section.getLevel(),
	      line: section.getLineNumber()-1,
	      location: new vscode.Location(document.uri, 
						  	new vscode.Position(section.getLineNumber()-1, 1)),
	    })
	  })

	  // Get full range of section
	  return toc.map((entry, startIndex): TocEntry => {
	    let end: number | undefined = undefined;
	    for (let i = startIndex + 1; i < toc.length; ++i) {
	      if (toc[i].level <= entry.level) {
	        end = toc[i].line - 1;
	        break;
	      }
	    }
	    const endLine = typeof end === 'number' ? end : document.lineCount - 1;
	    return {
	      ...entry,
	      location: new vscode.Location(document.uri,
	        new vscode.Range(
	          entry.location.range.start,
	          new vscode.Position(endLine, document.lineAt(endLine).range.end.character))),
	    };
	  });
	}

}
