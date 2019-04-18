/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import MDDocumentSymbolProvider from '../features/documentSymbolProvider';
import AsciidocWorkspaceSymbolProvider, { WorkspaceAsciidocDocumentProvider } from '../features/workspaceSymbolProvider';
import { createNewAsciidocEngine } from './engine';
import { InMemoryDocument } from './inMemoryDocument';


const symbolProvider = new MDDocumentSymbolProvider(createNewAsciidocEngine());

suite('asciidoc.WorkspaceSymbolProvider', () => {
	test('Should not return anything for empty workspace', async () => {
		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceAsciidocDocumentProvider([]));

		assert.deepEqual(await provider.provideWorkspaceSymbols(''), []);
	});

	test('Should return symbols from workspace with one asciidoc file', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceAsciidocDocumentProvider([
			new InMemoryDocument(testFileName, `# header1\nabc\n## header2`)
		]));

		const symbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(symbols.length, 2);
		assert.strictEqual(symbols[0].name, '# header1');
		assert.strictEqual(symbols[1].name, '## header2');
	});

	test('Should return all content  basic workspace', async () => {
		const fileNameCount = 10;
		const files: vscode.TextDocument[] = [];
		for (let i = 0; i < fileNameCount; ++i) {
			const testFileName = vscode.Uri.parse(`test${i}.md`);
			files.push(new InMemoryDocument(testFileName, `# common\nabc\n## header${i}`));
		}

		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, new InMemoryWorkspaceAsciidocDocumentProvider(files));

		const symbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(symbols.length, fileNameCount * 2);
	});

	test('Should update results when asciidoc file changes symbols', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceAsciidocDocumentProvider([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);

		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// Update file
		workspaceFileProvider.updateDocument(new InMemoryDocument(testFileName, `# new header\nabc\n## header2`));
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 2);
		assert.strictEqual(newSymbols[0].name, '# new header');
		assert.strictEqual(newSymbols[1].name, '## header2');
	});

	test('Should remove results when file is deleted', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceAsciidocDocumentProvider([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);
		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// delete file
		workspaceFileProvider.deleteDocument(testFileName);
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 0);
	});

	test('Should update results when asciidoc file is created', async () => {
		const testFileName = vscode.Uri.file('test.md');

		const workspaceFileProvider = new InMemoryWorkspaceAsciidocDocumentProvider([
			new InMemoryDocument(testFileName, `# header1`)
		]);

		const provider = new AsciidocWorkspaceSymbolProvider(symbolProvider, workspaceFileProvider);
		assert.strictEqual((await provider.provideWorkspaceSymbols('')).length, 1);

		// Creat file
		workspaceFileProvider.createDocument(new InMemoryDocument(vscode.Uri.file('test2.md'), `# new header\nabc\n## header2`));
		const newSymbols = await provider.provideWorkspaceSymbols('');
		assert.strictEqual(newSymbols.length, 3);
	});
});


class InMemoryWorkspaceAsciidocDocumentProvider implements WorkspaceAsciidocDocumentProvider {
	private readonly _documents = new Map<string, vscode.TextDocument>();

	constructor(documents: vscode.TextDocument[]) {
		for (const doc of documents) {
			this._documents.set(doc.fileName, doc);
		}
	}

	async getAllAsciidocDocuments() {
		return Array.from(this._documents.values());
	}

	private readonly _onDidChangeAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>();
	public onDidChangeAsciidocDocument = this._onDidChangeAsciidocDocumentEmitter.event;

	private readonly _onDidCreateAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.TextDocument>();
	public onDidCreateAsciidocDocument = this._onDidCreateAsciidocDocumentEmitter.event;

	private readonly _onDidDeleteAsciidocDocumentEmitter = new vscode.EventEmitter<vscode.Uri>();
	public onDidDeleteAsciidocDocument = this._onDidDeleteAsciidocDocumentEmitter.event;

	public updateDocument(document: vscode.TextDocument) {
		this._documents.set(document.fileName, document);
		this._onDidChangeAsciidocDocumentEmitter.fire(document);
	}

	public createDocument(document: vscode.TextDocument) {
		assert.ok(!this._documents.has(document.uri.fsPath));

		this._documents.set(document.uri.fsPath, document);
		this._onDidCreateAsciidocDocumentEmitter.fire(document);
	}

	public deleteDocument(resource: vscode.Uri) {
		this._documents.delete(resource.fsPath);
		this._onDidDeleteAsciidocDocumentEmitter.fire(resource);
	}
}
