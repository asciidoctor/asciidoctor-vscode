/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Token } from 'markdown-it';
import * as path from 'path';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { MarkdownContributions } from './markdownExtensions';
import { Slugifier } from './slugify';
import { getUriForLinkWithKnownExternalScheme } from './util/links';
import * as Asciidoctor from "asciidoctor.js";

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/;

export class MarkdownEngine {
    private ad?: Asciidoctor;

	private firstLine?: number;

	private currentDocument?: vscode.Uri;

	public constructor(
		private readonly extensionPreviewResourceProvider: MarkdownContributions,
		private readonly slugifier: Slugifier,
	) { }


	private async getEngine(resource: vscode.Uri): Promise<Asciidoctor> {
		if (!this.ad) {
            this.ad = (await import('asciidoctor.js'))();
		}

		const config = vscode.workspace.getConfiguration('markdown', resource);
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
        const options = {
            safe: 'unsafe',
            doctype: 'article',
            header_footer: true,
            to_file: false,
            sourcemap: true,
        }
		this.currentDocument = document;
		this.firstLine = offset;
        const engine = await this.getEngine(document);
        let ascii_doc = engine.load(text, options);
        const blocksWithLineNumber = ascii_doc.findBy(function (b) { return typeof b.getLineNumber() !== 'undefined'; });
        blocksWithLineNumber.forEach(function (block, key, myArray) {
            block.addRole("data-line-" + block.getLineNumber());
        })
        return ascii_doc.convert();
	}

	public async parse(document: vscode.Uri, source: string): Promise<Token[]> {
		const { text, offset } = this.stripFrontmatter(source);
		this.currentDocument = document;
		const engine = await this.getEngine(document);

		return engine.parse(text, {}).map(token => {
			if (token.map) {
				token.map[0] += offset;
				token.map[1] += offset;
			}
			return token;
		});
	}

	private addLineNumberRenderer(md: any, ruleName: string): void {
		const original = md.renderer.rules[ruleName];
		md.renderer.rules[ruleName] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrSet('data-line', this.firstLine + token.map[0]);
				token.attrJoin('class', 'code-line');
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addImageStabilizer(md: any): void {
		const original = md.renderer.rules.image;
		md.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			token.attrJoin('class', 'loading');

			const src = token.attrGet('src');
			if (src) {
				const hash = crypto.createHash('sha256');
				hash.update(src);
				const imgHash = hash.digest('hex');
				token.attrSet('id', `image-hash-${imgHash}`);
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options, env, self);
			}
		};
	}

	private addFencedRenderer(md: any): void {
		const original = md.renderer.rules['fenced'];
		md.renderer.rules['fenced'] = (tokens: any, idx: number, options: any, env: any, self: any) => {
			const token = tokens[idx];
			if (token.map && token.map.length) {
				token.attrJoin('class', 'hljs');
			}

			return original(tokens, idx, options, env, self);
		};
	}

	private addLinkNormalizer(md: any): void {
		const normalizeLink = md.normalizeLink;
		md.normalizeLink = (link: string) => {
			try {
				const externalSchemeUri = getUriForLinkWithKnownExternalScheme(link);
				if (externalSchemeUri) {
					return normalizeLink(externalSchemeUri.toString());
				}


				// Assume it must be an relative or absolute file path
				// Use a fake scheme to avoid parse warnings
				let uri = vscode.Uri.parse(`vscode-resource:${link}`);

				if (uri.path) {
					// Assume it must be a file
					const fragment = uri.fragment;
					if (uri.path[0] === '/') {
						const root = vscode.workspace.getWorkspaceFolder(this.currentDocument!);
						if (root) {
							uri = vscode.Uri.file(path.join(root.uri.fsPath, uri.path));
						}
					} else {
						uri = vscode.Uri.file(path.join(path.dirname(this.currentDocument!.path), uri.path));
					}

					if (fragment) {
						uri = uri.with({
							fragment: this.slugifier.fromHeading(fragment).value
						});
					}
					return normalizeLink(uri.with({ scheme: 'vscode-resource' }).toString(true));
				} else if (!uri.path && uri.fragment) {
					return `#${this.slugifier.fromHeading(uri.fragment).value}`;
				}
			} catch (e) {
				// noop
			}
			return normalizeLink(link);
		};
	}

	private addLinkValidator(md: any): void {
		const validateLink = md.validateLink;
		md.validateLink = (link: string) => {
			// support file:// links
			return validateLink(link) || link.indexOf('file:') === 0;
		};
	}
}