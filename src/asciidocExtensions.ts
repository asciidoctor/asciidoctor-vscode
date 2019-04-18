/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

const resolveExtensionResource = (extension: vscode.Extension<any>, resourcePath: string): vscode.Uri => {
	return vscode.Uri.file(path.join(extension.extensionPath, resourcePath))
		.with({ scheme: 'vscode-resource' });
};

const resolveExtensionResources = (extension: vscode.Extension<any>, resourcePaths: any): vscode.Uri[] => {
	const result: vscode.Uri[] = [];
	if (Array.isArray(resourcePaths)) {
		for (const resource of resourcePaths) {
			try {
				result.push(resolveExtensionResource(extension, resource));
			} catch (e) {
				// noop
			}
		}
	}
	return result;
};

export interface AsciidocContributions {
	readonly extensionPath: string;
	readonly previewScripts: vscode.Uri[];
	readonly previewStylesEditor: vscode.Uri[];
	readonly previewStylesDefault: vscode.Uri[];
	readonly asciidocItPlugins: Thenable<(md: any) => any>[];
	readonly previewResourceRoots: vscode.Uri[];
}

class AsciidocExtensionContributions implements AsciidocContributions {
	private readonly _scripts: vscode.Uri[] = [];
	private readonly _stylesEditor: vscode.Uri[] = [];
	private readonly _stylesDefault: vscode.Uri[] = [];
	private readonly _previewResourceRoots: vscode.Uri[] = [];
	private readonly _plugins: Thenable<(md: any) => any>[] = [];

	private _loaded = false;

	public constructor(
		public readonly extensionPath: string,
	) { }

	public get previewScripts(): vscode.Uri[] {
		this.ensureLoaded();
		return this._scripts;
	}

	public get previewStylesEditor(): vscode.Uri[] {
		this.ensureLoaded();
		return this._stylesEditor;
	}

	public get previewStylesDefault(): vscode.Uri[] {
		this.ensureLoaded();
		return this._stylesDefault;
	}

	public get previewResourceRoots(): vscode.Uri[] {
		this.ensureLoaded();
		return this._previewResourceRoots;
	}

	public get asciidocItPlugins(): Thenable<(md: any) => any>[] {
		this.ensureLoaded();
		return this._plugins;
	}

	private ensureLoaded() {
		if (this._loaded) {
			return;
		}

		this._loaded = true;
		for (const extension of vscode.extensions.all) {
			const contributes = extension.packageJSON && extension.packageJSON.contributes;
			if (!contributes) {
				continue;
			}
		}
	}

}

export function getAsciidocExtensionContributions(context: vscode.ExtensionContext): AsciidocContributions {
	return new AsciidocExtensionContributions(context.extensionPath);
}
