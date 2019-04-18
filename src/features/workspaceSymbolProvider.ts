/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { disposeAll } from '../util/dispose';
import { isAsciidocFile } from '../util/file';
import { Lazy, lazy } from '../util/lazy';
import MDDocumentSymbolProvider from './documentSymbolProvider';
import { SkinnyTextDocument } from '../tableOfContentsProvider';

export interface WorkspaceAsciidocDocumentProvider {
	getAllAsciidocDocuments(): Thenable<Iterable<SkinnyTextDocument>>;

	readonly onDidChangeAsciidocDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidCreateAsciidocDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidDeleteAsciidocDocument: vscode.Event<vscode.Uri>;
}

class VSCodeWorkspaceAsciidocDocumentProvider implements WorkspaceAsciidocDocumentProvider {

	private readonly _onDidChangeAsciidocDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	private readonly _onDidCreateAsciidocDocumentEmitter = new vscode.EventEmitter<SkinnyTextDocument>();
	private readonly _onDidDeleteAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();

	private _watcher: vscode.FileSystemWatcher | undefined;
	private _disposables: vscode.Disposable[] = [];

	public dispose() {
		this._onDidChangeAsciidocDocumentEmitter.dispose();
		this._onDidDeleteAsciidocDocumentEmitter.dispose();

		if (this._watcher) {
			this._watcher.dispose();
		}

		disposeAll(this._disposables);
	}

	async getAllAsciidocDocuments() {
		const resources = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
		const docs = await Promise.all(resources.map(doc => this.getAsciidocDocument(doc)));
		return docs.filter(doc => !!doc) as SkinnyTextDocument[];
	}

	public get onDidChangeAsciidocDocument() {
		this.ensureWatcher();
		return this._onDidChangeAsciidocDocumentEmitter.event;
	}

	public get onDidCreateAsciidocDocument() {
		this.ensureWatcher();
		return this._onDidCreateAsciidocDocumentEmitter.event;
	}

	public get onDidDeleteAsciidocDocument() {
		this.ensureWatcher();
		return this._onDidDeleteAsciidocDocumentEmitter.event;
	}

	private ensureWatcher(): void {
		if (this._watcher) {
			return;
		}

		this._watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

		this._watcher.onDidChange(async resource => {
			const document = await this.getAsciidocDocument(resource);
			if (document) {
				this._onDidChangeAsciidocDocumentEmitter.fire(document);
			}
		}, null, this._disposables);

		this._watcher.onDidCreate(async resource => {
			const document = await this.getAsciidocDocument(resource);
			if (document) {
				this._onDidCreateAsciidocDocumentEmitter.fire(document);
			}
		}, null, this._disposables);

		this._watcher.onDidDelete(async resource => {
			this._onDidDeleteAsciidocDocumentEmitter.fire(resource);
		}, null, this._disposables);

		vscode.workspace.onDidChangeTextDocument(e => {
			if (isAsciidocFile(e.document)) {
				this._onDidChangeAsciidocDocumentEmitter.fire(e.document);
			}
		}, null, this._disposables);
	}

	private async getAsciidocDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined> {
		const doc = await vscode.workspace.openTextDocument(resource);
		return doc && isAsciidocFile(doc) ? doc : undefined;
	}
}


export default class AsciidocWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	private _symbolCache = new Map<string, Lazy<Thenable<vscode.SymbolInformation[]>>>();
	private _symbolCachePopulated: boolean = false;
	private _disposables: vscode.Disposable[] = [];

	public constructor(
		private _symbolProvider: MDDocumentSymbolProvider,
		private _workspaceAsciidocDocumentProvider: WorkspaceAsciidocDocumentProvider = new VSCodeWorkspaceAsciidocDocumentProvider()
	) { }

	public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		if (!this._symbolCachePopulated) {
			await this.populateSymbolCache();
			this._symbolCachePopulated = true;

			this._workspaceAsciidocDocumentProvider.onDidChangeAsciidocDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceAsciidocDocumentProvider.onDidCreateAsciidocDocument(this.onDidChangeDocument, this, this._disposables);
			this._workspaceAsciidocDocumentProvider.onDidDeleteAsciidocDocument(this.onDidDeleteDocument, this, this._disposables);
		}

		const allSymbolsSets = await Promise.all(Array.from(this._symbolCache.values()).map(x => x.value));
		const allSymbols: vscode.SymbolInformation[] = Array.prototype.concat.apply([], allSymbolsSets);
		return allSymbols.filter(symbolInformation => symbolInformation.name.toLowerCase().indexOf(query.toLowerCase()) !== -1);
	}

	public async populateSymbolCache(): Promise<void> {
		const asciidocDocumentUris = await this._workspaceAsciidocDocumentProvider.getAllAsciidocDocuments();
		for (const document of asciidocDocumentUris) {
			this._symbolCache.set(document.uri.fsPath, this.getSymbols(document));
		}
	}

	public dispose(): void {
		disposeAll(this._disposables);
	}

	private getSymbols(document: SkinnyTextDocument): Lazy<Thenable<vscode.SymbolInformation[]>> {
		return lazy(async () => {
			return this._symbolProvider.provideDocumentSymbolInformation(document);
		});
	}

	private onDidChangeDocument(document: SkinnyTextDocument) {
		this._symbolCache.set(document.uri.fsPath, this.getSymbols(document));
	}

	private onDidDeleteDocument(resource: vscode.Uri) {
		this._symbolCache.delete(resource.fsPath);
	}
}
