/*
Activation Trigger:
    Keybindings the the adoc.preview and adoc.previewToSide commands (wehn editorTextFocus)

On Activation:
    Create a provider for the adoc-preview uri scheme
    Register the adoc.preview and adoc.previewToSide command functions

On adoc.preview command execution:
    Call CreateHTMLWindow() targetting the active editor view column

On adoc.previewToSide execution:
    Call CreateHTMLWindow() targetting the next editor view column

*/
// https://code.visualstudio.com/Docs/extensionAPI/vscode-api

'use strict';
import * as vscode from 'vscode';

import TextDocumentContentProvider from './TextDocumentContentProvider';



import registerDocumentSymbolProvider from './AsciiDocSymbolProvider';

import * as path from "path";
import * as AsciiDoc from "asciidoctor.js";

let provider: TextDocumentContentProvider;


export function activate(context: vscode.ExtensionContext): void {
    const previewUri = vscode.Uri.parse('asciidoc://authority/asciidoc');

    provider = new TextDocumentContentProvider(previewUri);
    vscode.workspace.registerTextDocumentContentProvider('asciidoc', provider);

    vscode.workspace.onDidSaveTextDocument(e => {
        const text = vscode.window.activeTextEditor.document.getText();
        provider.update(previewUri);
    })

    vscode.workspace.onDidChangeTextDocument(e => {
        if(e.document.languageId == "asciidoc" && e.contentChanges.length > 0) {
            var range = e.contentChanges[0].range
            var line = range.start.line
            provider.current_line = line;
            //console.log("On line", line)
        }
        //console.log("line", e.contentChanges[0].range[0].line);
        if(e.document.uri.scheme == 'file') {
            provider.needsRebuild = true;
        }
    })

    vscode.window.onDidChangeTextEditorSelection(e => {
        provider.current_line = e.selections[0].anchor.line;
        provider.update(previewUri);
    })


    vscode.window.onDidChangeActiveTextEditor(e => {
        provider.needsRebuild = true;
    })

    let displayColumn: vscode.ViewColumn;
    switch (vscode.window.activeTextEditor.viewColumn) {
        case vscode.ViewColumn.One:
            displayColumn = vscode.ViewColumn.Two;
            break;
        case vscode.ViewColumn.Two:
        case vscode.ViewColumn.Three:
            displayColumn = vscode.ViewColumn.Three;
            break;
    }

    const previewToSide = vscode.commands.registerCommand("adoc.previewToSide", () => {
        vscode.commands
            .executeCommand('vscode.previewHtml', previewUri, displayColumn, 'asciidoc')
            .then(() => { }, vscode.window.showErrorMessage);
    })

    const preview = vscode.commands.registerCommand("adoc.preview", () => {
        vscode.commands
            .executeCommand('vscode.previewHtml', previewUri, vscode.window.activeTextEditor.viewColumn, 'asciidoc')
            .then(() => { }, vscode.window.showErrorMessage);
    })
    const symbolProvider = registerDocumentSymbolProvider();

    context.subscriptions.push(previewToSide, preview, symbolProvider);
}

// this method is called when your extension is deactivated
export function deactivate(): void {
}
