import * as vscode from 'vscode';
import { AsciidocProvider } from '../providers/asciidoc.provider';
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
      ...[":"]
    );

    this.disposables.push(disposable);
	}

	dispose() {
	  disposeAll(this.disposables);
	}

	private readonly _onDidIncludeAutoCompletionEmitter = new vscode.EventEmitter<{ resource: vscode.Uri, line: number }>();
	public readonly onDidIncludeAutoCompletionEmitter = this._onDidIncludeAutoCompletionEmitter.event;
}
