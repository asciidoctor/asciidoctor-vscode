/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownContributions } from './markdownExtensions';
import { Slugifier } from './slugify';
import { getUriForLinkWithKnownExternalScheme } from './util/links';
import { AsciiDocParser } from './text-parser'

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/;

export class MarkdownEngine {
    private ad?: AsciiDocParser;

	private firstLine?: number;

	private currentDocument?: vscode.Uri;

	public constructor(
		private readonly extensionPreviewResourceProvider: MarkdownContributions,
		private readonly slugifier: Slugifier,
	) { }


	private async getEngine(resource: vscode.Uri): Promise<AsciiDocParser> {
		if (!this.ad) {
            this.ad = new AsciiDocParser(resource.fsPath);
		}

		const config = vscode.workspace.getConfiguration('asciidoc', resource);
		return this.ad;
	}

	private stripFrontmatter(text: string): { text: string, offset: number } {
		let offset = 0;
		const frontMatterMatch = FrontMatterRegex.exec(text);
		if (frontMatterMatch) {
			const frontMatter = frontMatterMatch[0];
			offset = frontMatter.split(/\r\n|\n|\r/g).length - 1;
			text = text.substr(frontMatter.length);
		}
		return { text, offset };
	}

	public async render(document: vscode.Uri, stripFrontmatter: boolean, text: string): Promise<string> {
		let offset = 0;
		if (stripFrontmatter) {
			const markdownContent = this.stripFrontmatter(text);
			offset = markdownContent.offset;
			text = markdownContent.text;
        }

		this.currentDocument = document;
		this.firstLine = offset;
        const engine = await this.getEngine(document);
        let ascii_doc = engine.parseText(text)
        return ascii_doc;
	}

	public async parse(document: vscode.Uri, source: string): Promise<any> {
		// const { text, offset } = this.stripFrontmatter(source);
		this.currentDocument = document;
        // const engine = await this.getEngine(document);

        return await {};
	}

}
