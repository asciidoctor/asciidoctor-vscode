/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class AsciidocPreviewConfiguration {
	public static getForResource(resource: vscode.Uri) {
		return new AsciidocPreviewConfiguration(resource);
	}

	public readonly scrollBeyondLastLine: boolean;
	public readonly wordWrap: boolean;
	public readonly previewFrontMatter: string;
	public readonly lineBreaks: boolean;
	public readonly doubleClickToSwitchToEditor: boolean;
	public readonly scrollEditorWithPreview: boolean;
	public readonly scrollPreviewWithEditor: boolean;
	public readonly markEditorSelection: boolean;

	public readonly lineHeight: number;
	public readonly fontSize: number;
	public readonly fontFamily: string | undefined;
	public readonly styles: string[];

	private constructor(resource: vscode.Uri) {
		const editorConfig = vscode.workspace.getConfiguration('editor', resource);
		const asciidocConfig = vscode.workspace.getConfiguration('asciidoc', resource);
		const asciidocEditorConfig = vscode.workspace.getConfiguration('[asciidoc]', resource);

		this.scrollBeyondLastLine = editorConfig.get<boolean>('scrollBeyondLastLine', false);

		this.wordWrap = editorConfig.get<string>('wordWrap', 'off') !== 'off';
		if (asciidocEditorConfig && asciidocEditorConfig['editor.wordWrap']) {
			this.wordWrap = asciidocEditorConfig['editor.wordWrap'] !== 'off';
		}

		this.previewFrontMatter = asciidocConfig.get<string>('previewFrontMatter', 'hide');
		this.scrollPreviewWithEditor = !!asciidocConfig.get<boolean>('preview.scrollPreviewWithEditor', true);
		this.scrollEditorWithPreview = !!asciidocConfig.get<boolean>('preview.scrollEditorWithPreview', true);
		this.lineBreaks = !!asciidocConfig.get<boolean>('preview.breaks', false);
		this.doubleClickToSwitchToEditor = !!asciidocConfig.get<boolean>('preview.doubleClickToSwitchToEditor', true);
		this.markEditorSelection = !!asciidocConfig.get<boolean>('preview.markEditorSelection', true);

		this.fontFamily = asciidocConfig.get<string | undefined>('preview.fontFamily', undefined);
		this.fontSize = Math.max(8, +asciidocConfig.get<number>('preview.fontSize', NaN));
		this.lineHeight = Math.max(0.6, +asciidocConfig.get<number>('preview.lineHeight', NaN));

		this.styles = asciidocConfig.get<string[]>('styles', []);
	}

	public isEqualTo(otherConfig: AsciidocPreviewConfiguration) {
		for (let key in this) {
			if (this.hasOwnProperty(key) && key !== 'styles') {
				if (this[key] !== otherConfig[key]) {
					return false;
				}
			}
		}

		// Check styles
		if (this.styles.length !== otherConfig.styles.length) {
			return false;
		}
		for (let i = 0; i < this.styles.length; ++i) {
			if (this.styles[i] !== otherConfig.styles[i]) {
				return false;
			}
		}

		return true;
	}

	[key: string]: any;
}

export class AsciidocPreviewConfigurationManager {
	private readonly previewConfigurationsForWorkspaces = new Map<string, AsciidocPreviewConfiguration>();

	public loadAndCacheConfiguration(
		resource: vscode.Uri
	): AsciidocPreviewConfiguration {
		const config = AsciidocPreviewConfiguration.getForResource(resource);
		this.previewConfigurationsForWorkspaces.set(this.getKey(resource), config);
		return config;
	}

	public hasConfigurationChanged(
		resource: vscode.Uri
	): boolean {
		const key = this.getKey(resource);
		const currentConfig = this.previewConfigurationsForWorkspaces.get(key);
		const newConfig = AsciidocPreviewConfiguration.getForResource(resource);
		return (!currentConfig || !currentConfig.isEqualTo(newConfig));
	}

	private getKey(
		resource: vscode.Uri
	): string {
		const folder = vscode.workspace.getWorkspaceFolder(resource);
		return folder ? folder.uri.toString() : '';
	}
}
