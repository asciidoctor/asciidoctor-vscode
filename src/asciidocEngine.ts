/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AsciidocContributions } from './asciidocExtensions';
import { Slugifier } from './slugify';
import { getUriForLinkWithKnownExternalScheme } from './util/links';
import { AsciidocParser } from './text-parser'

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/;

export class AsciidocEngine {
    private ad?: AsciidocParser;

	private firstLine?: number;

	private currentDocument?: vscode.Uri;

	public constructor(
		private readonly extensionPreviewResourceProvider: AsciidocContributions,
		private readonly slugifier: Slugifier,
		private readonly errorCollection: vscode.DiagnosticCollection = null
	) { }


	private async getEngine(resource: vscode.Uri): Promise<AsciidocParser> {
	  if (!this.ad) {
	    this.ad = new AsciidocParser(resource.fsPath, this.errorCollection);
	  }

	  const config = vscode.workspace.getConfiguration('asciidoc', resource);
	  return this.ad;
	}

	public async render(document: vscode.Uri, text: string, 
	  forHTML: boolean = false, backend: string = 'html5'): Promise<string> {
	  const engine = await this.getEngine(document);
	  const doc = await vscode.workspace.openTextDocument(document);
	  let ascii_doc = engine.parseText(text, doc, forHTML, backend)
	  return ascii_doc;
	}

	public async parse(document: vscode.Uri, source: string): Promise<any> {
	  this.currentDocument = document;
	  const engine = await this.getEngine(document);
	  const doc = await vscode.workspace.openTextDocument(document);
	  let ascii_doc = await engine.parseText(source, doc);
	  return engine.document
	}

}
