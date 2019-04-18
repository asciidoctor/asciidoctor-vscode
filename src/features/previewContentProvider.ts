/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { AsciidocEngine } from '../asciidocEngine';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { Logger } from '../logger';
import { ContentSecurityPolicyArbiter, AsciidocPreviewSecurityLevel } from '../security';
import { AsciidocPreviewConfigurationManager, AsciidocPreviewConfiguration } from './previewConfig';
import { AsciidocContributions } from '../asciidocExtensions';

/**
 * Strings used inside the asciidoc preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
	cspAlertMessageText: localize(
		'preview.securityMessage.text',
		'Some content has been disabled in this document'),

	cspAlertMessageTitle: localize(
		'preview.securityMessage.title',
		'Potentially unsafe or insecure content has been disabled in the Asciidoc preview. Change the Asciidoc preview security setting to allow insecure content or enable scripts'),

	cspAlertMessageLabel: localize(
		'preview.securityMessage.label',
		'Content Disabled Security Warning')
};

export class AsciidocContentProvider {
	constructor(
		private readonly engine: AsciidocEngine,
		private readonly context: vscode.ExtensionContext,
		private readonly cspArbiter: ContentSecurityPolicyArbiter,
		private readonly contributions: AsciidocContributions,
		private readonly logger: Logger
	) { }

	public async provideTextDocumentContent(
		asciidocDocument: vscode.TextDocument,
		previewConfigurations: AsciidocPreviewConfigurationManager,
		initialLine: number | undefined = undefined,
		state?: any
	): Promise<string> {
		const sourceUri = asciidocDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			line: initialLine,
			lineCount: asciidocDocument.lineCount,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings()
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
		const csp = this.getCspForResource(sourceUri, nonce);

		const body = await this.engine.render(sourceUri, config.previewFrontMatter === 'hide', asciidocDocument.getText());
		return `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-asciidoc-preview-data"
					data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}"
					data-strings="${JSON.stringify(previewStrings).replace(/"/g, '&quot;')}"
					data-state="${JSON.stringify(state || {}).replace(/"/g, '&quot;')}">
				<script src="${this.extensionResourcePath('pre.js')}" nonce="${nonce}"></script>
				${this.getStyles(sourceUri, nonce, config, state)}
				<base href="${asciidocDocument.uri.with({ scheme: 'vscode-resource' }).toString(true)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body}
				<div class="code-line" data-line="${asciidocDocument.lineCount}"></div>
				${this.getScripts(nonce)}
			</body>
			</html>`;
	}

	private extensionResourcePath(mediaFile: string): string {
		return vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile)))
			.with({ scheme: 'vscode-resource' })
			.toString();
	}

	private fixHref(resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

		// Use href if it is already an URL
		const hrefUri = vscode.Uri.parse(href);
		if (['http', 'https'].indexOf(hrefUri.scheme) >= 0) {
			return hrefUri.toString();
		}

		// Use href as file URI if it is absolute
		if (path.isAbsolute(href) || hrefUri.scheme === 'file') {
			return vscode.Uri.file(href)
				.with({ scheme: 'vscode-resource' })
				.toString();
		}

		// Use a workspace relative path if there is a workspace
		let root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			return vscode.Uri.file(path.join(root.uri.fsPath, href))
				.with({ scheme: 'vscode-resource' })
				.toString();
		}

		// Otherwise look relative to the asciidoc file
		return vscode.Uri.file(path.join(path.dirname(resource.fsPath), href))
			.with({ scheme: 'vscode-resource' })
			.toString();
	}

	private computeCustomStyleSheetIncludes(resource: vscode.Uri, config: AsciidocPreviewConfiguration): string {
		if (Array.isArray(config.styles)) {
			return config.styles.map(style => {
				return `<link rel="stylesheet" class="code-user-style" data-source="${style.replace(/"/g, '&quot;')}" href="${this.fixHref(resource, style)}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(nonce: string, config: AsciidocPreviewConfiguration): string {
		return `<style nonce="${nonce}">
			body {
				${config.fontFamily ? `font-family: ${config.fontFamily};` : ''}
				${isNaN(config.fontSize) ? '' : `font-size: ${config.fontSize}px;`}
				${isNaN(config.lineHeight) ? '' : `line-height: ${config.lineHeight};`}
			}
		</style>`;
	}

	private getImageStabilizerStyles(state?: any) {
		let ret = '<style>\n';
		if (state && state.imageInfo) {
			state.imageInfo.forEach((imgInfo: any) => {
				ret += `#${imgInfo.id}.loading {
					height: ${imgInfo.height}px;
					width: ${imgInfo.width}px;
				}\n`;
			});
		}
		ret += '</style>\n';

		return ret;
	}

	private getStyles(resource: vscode.Uri, nonce: string, config: AsciidocPreviewConfiguration, state?: any): string {
		const useEditorStyle = vscode.workspace.getConfiguration('asciidoc').get('preview.useEditorStyle')
		var baseStyles;
		if (useEditorStyle) {
			baseStyles = this.contributions.previewStylesEditor
				.map(resource => `<link rel="stylesheet" type="text/css" href="${resource.toString()}">`)
				.join('\n');
		} else {
			baseStyles = this.contributions.previewStylesDefault
				.map(resource => `<link rel="stylesheet" type="text/css" href="${resource.toString()}">`)
				.join('\n');
		}

		return `${baseStyles}
			${this.getSettingsOverrideStyles(nonce, config)}
			${this.computeCustomStyleSheetIncludes(resource, config)}
			${this.getImageStabilizerStyles(state)}`;
	}

	private getScripts(nonce: string): string {
		return this.contributions.previewScripts
			.map(resource => `<script async src="${resource.toString()}" nonce="${nonce}" charset="UTF-8"></script>`)
			.join('\n');
	}

	private getCspForResource(resource: vscode.Uri, nonce: string): string {
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
			case AsciidocPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: http: https: data:; media-src vscode-resource: http: https: data:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' http: https: data:; font-src vscode-resource: http: https: data:;">`;

			case AsciidocPreviewSecurityLevel.AllowInsecureLocalContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*; media-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src vscode-resource: https: data: http://localhost:* http://127.0.0.1:*;">`;

			case AsciidocPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '';

			case AsciidocPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: data:; media-src vscode-resource: https: data:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' https: data:; font-src vscode-resource: https: data:;">`;
		}
	}
}
