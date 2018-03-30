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


import WebSocketServer from './WebSocketServer';
import registerDocumentSymbolProvider from './AsciiDocSymbolProvider';

import * as path from "path";
import * as AsciiDoc from "asciidoctor.js";

let websocket: WebSocketServer;
let provider: TextDocumentContentProvider;


export function activate(context: vscode.ExtensionContext): void {
    const previewUri = vscode.Uri.parse('asciidoc://authority/asciidoc');

    websocket = new WebSocketServer(webSocketServerUrl => {
        provider = new TextDocumentContentProvider(webSocketServerUrl, previewUri);
        vscode.workspace.registerTextDocumentContentProvider('asciidoc', provider);

        vscode.workspace.onDidSaveTextDocument(e => {
            const text = vscode.window.activeTextEditor.document.getText();
            provider.update(previewUri);
        });

        vscode.workspace.onDidChangeTextDocument(e => {
            provider.setNeedsRebuild(true);
        });
    });

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
    websocket.dispose();
}
