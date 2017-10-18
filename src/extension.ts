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
import {
    workspace,
    window,
    commands,
    Disposable,
    ExtensionContext,
    ViewColumn,
    TextDocumentChangeEvent,
    TextEditorSelectionChangeEvent,
    TextDocument,
    Uri
} from 'vscode';

import AsciiDocProvider, {
    CreateHTMLWindow,
    MakePreviewUri
} from './AsciiDocProvider';

import registerDocumentSymbolProvider from './AsciiDocSymbolProvider';

import * as path from "path";

export function activate(context: ExtensionContext) {

    const provider = new AsciiDocProvider();
    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(AsciiDocProvider.scheme, provider)
    )

    // When the active document is changed set the provider for rebuild
    //this only occurs after an edit in a document
    workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
        if (e.document === window.activeTextEditor.document) {
            provider.setNeedsRebuild(true);
           //provider.update(MakePreviewUri(e.document));
        }
    })


    // This occurs whenever the selected document changes, its useful to keep the
    window.onDidChangeTextEditorSelection((e: TextEditorSelectionChangeEvent) => {
        if (!!e && !!e.textEditor && (e.textEditor === window.activeTextEditor)) {
            provider.setNeedsRebuild(true);
          //  provider.update(MakePreviewUri(e.textEditor.document));
        }
    })
    
    workspace.onDidSaveTextDocument((e: TextDocument) => {
        if (e === window.activeTextEditor.document) {
            provider.update(MakePreviewUri(e));
        }
    })

    let previewToSide = commands.registerCommand("adoc.previewToSide", () => {
        let displayColumn: ViewColumn;
        switch (window.activeTextEditor.viewColumn) {
            case ViewColumn.One:
                displayColumn = ViewColumn.Two;
                break;
            case ViewColumn.Two:
            case ViewColumn.Three:
                displayColumn = ViewColumn.Three;
                break;
        }
        return CreateHTMLWindow(provider, displayColumn);
    })

    let preview = commands.registerCommand("adoc.preview", () => {
        return CreateHTMLWindow(provider, window.activeTextEditor.viewColumn);
    })

    const registration = registerDocumentSymbolProvider();

    context.subscriptions.push(previewToSide, preview, providerRegistrations, registration);
}

// this method is called when your extension is deactivated
export function deactivate() { }