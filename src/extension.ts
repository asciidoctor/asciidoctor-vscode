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
    Uri
} from 'vscode';

import AsciiDocProvider, {
    CreateHTMLWindow,
    CreateRefreshTimer
} from './AsciiDocProvider';

import * as path from "path";


export function activate(context: ExtensionContext) {

    const provider = new AsciiDocProvider();
    const providerRegistrations = Disposable.from(
        workspace.registerTextDocumentContentProvider(AsciiDocProvider.scheme, provider)
    )

    let previewTitle = `Preview: '${path.basename(window.activeTextEditor.document.fileName)}'`;
    let previewUri = Uri.parse(`adoc-preview://preview/${previewTitle}`)

    CreateRefreshTimer(provider, window.activeTextEditor, previewUri)
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

    context.subscriptions.push(previewToSide, preview, providerRegistrations);
}

// this method is called when your extension is deactivated
export function deactivate() { }