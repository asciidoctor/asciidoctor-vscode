/*
Activation Trigger:
    Keybindings the the adoc.preview and adoc.previewToSide commands (wehn editorTextFocus)

On Activation:
    Create a provider for the adoc-preview uri scheme
    Register the adoc.preview and adoc.previewToSide command functions
*/
// https://code.visualstudio.com/Docs/extensionAPI/vscode-api

'use strict';
import * as vscode from 'vscode';

var tmp = require('tmp');
var fs = require("fs");

import TextDocumentContentProvider from './TextDocumentContentProvider';
import registerDocumentSymbolProvider from './AsciiDocSymbolProvider';
import ExportAsPDF from './ExportAsPDF';

import * as path from "path";
import * as AsciiDoc from "asciidoctor.js";

let provider: TextDocumentContentProvider;


export function activate(context: vscode.ExtensionContext): void {

    const previewUri = vscode.Uri.parse('asciidoc://authority/asciidoc');
    let document: vscode.TextDocument = null

    provider = new TextDocumentContentProvider(previewUri);
    vscode.workspace.registerTextDocumentContentProvider('asciidoc', provider);

    vscode.workspace.onDidSaveTextDocument(e => {
        provider.update(previewUri);
    })

    vscode.workspace.onDidChangeTextDocument(e => {
        if(isAsciiDocFile(e.document)) {
            provider.needsRebuild = true
            if(e.contentChanges.length > 0) {
                var range = e.contentChanges[0].range
                var line = range.start.line
                provider.current_line = line;
            }
        }
    })

    vscode.window.onDidChangeTextEditorSelection(e => {
        provider.current_line = e.selections[0].anchor.line;
        provider.needsRebuild = true;
    })


    vscode.window.onDidChangeActiveTextEditor(e => {
        if(isAsciiDocFile(e.document)) {
            provider.needsRebuild = true
            provider.update(previewUri)
        }
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
        provider.needsRebuild = true
        console.log("updating doc", vscode.window.activeTextEditor.document)
        provider.active_update(previewUri)
        console.log("previewing doc", vscode.window.activeTextEditor.document)
        vscode.commands
            .executeCommand('vscode.previewHtml', previewUri, vscode.window.activeTextEditor.viewColumn, 'asciidoc')
            .then(() => { }, vscode.window.showErrorMessage)
    })


    const symbolProvider = registerDocumentSymbolProvider();

    const ExportAsPDFDisposable = vscode.commands.registerCommand("adoc.ExportAsPDF", ExportAsPDF);

    context.subscriptions.push(previewToSide, preview, symbolProvider, ExportAsPDFDisposable);

}

// this method is called when your extension is deactivated
export function deactivate(): void {
}

export function isAsciiDocFile(document: vscode.TextDocument) {
    return document.languageId === 'asciidoc'
        && document.uri.scheme !== 'asciidoc' // prevent processing of own documents
}

