import * as vscode from 'vscode';
import { AsciidocProvider } from '../providers/asciidoc.provider';
import { BibtexProvider } from "../providers/bibtex.provider";
import { disposeAll } from '../util/dispose';

export class AsciidocFileIncludeAutoCompletionMonitor {
	private readonly disposables: vscode.Disposable[] = [];
	constructor() {
    vscode.languages.registerReferenceProvider

    const disposable = vscode.languages.registerCompletionItemProvider(
      {
        language: "asciidoc",
        scheme: "file",
      },
      AsciidocProvider,
      ...[":", "/"]
    );

    const bibtexDisposable = vscode.languages.registerCompletionItemProvider(
      {
        language: "asciidoc",
        scheme: "file",
      },
      BibtexProvider,
      ...[":", "/"]
    );

    this.disposables.push(disposable);
    this.disposables.push(bibtexDisposable);
	}

	dispose() {
	  disposeAll(this.disposables);
	}

	private readonly _onDidIncludeAutoCompletionEmitter = new vscode.EventEmitter<{ resource: vscode.Uri, line: number }>();
	public readonly onDidIncludeAutoCompletionEmitter = this._onDidIncludeAutoCompletionEmitter.event;
}
