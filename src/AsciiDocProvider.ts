import {
    workspace,
    window,
    commands,
    ExtensionContext,
    TextEditorSelectionChangeEvent,
    TextDocumentChangeEvent,
    TextDocumentContentProvider,
    EventEmitter,
    ViewColumn,
    Uri,
    Event,
    Disposable,
    TextDocument,
    TextEditor
} from 'vscode';

import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
let fileUrl = require("file-url");
let tmp = require("tmp");

const timerPeriod = 1000;  // Time between preview updates


export default class AsciiDocProvider implements TextDocumentContentProvider {
    static scheme = 'adoc-preview';

    private _onDidChange = new EventEmitter<Uri>();
    private resultText = "";
    private lastPreviewHTML = null;
    private lastPreviewTime = new Date();
    private needs_rebuild = true;


    public provideTextDocumentContent(uri: Uri): string | Thenable<string> {
        return this.createAsciiDocHTML();
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }

    private createAsciiDocHTML(): string | Thenable<string> {
        let editor = window.activeTextEditor;
        if (!(editor.document.languageId === "asciidoc")) {
            return this.errorSnippet("Active editor doesn't show an AsciiDoc document - no properties to preview.");
        }
        if (this.needs_rebuild) {
            this.lastPreviewHTML = this.preview(editor);
            this.needs_rebuild = false
        }
        return this.lastPreviewHTML
    }

    private errorSnippet(error: string): string {
        return `
                <body>
                    ${error}
                </body>`;
    }

    private buildPage(document: string): string {
        return document;
    }

    private createStylesheet(file: string) {
        let href = fileUrl(
            path.join(
                __dirname,
                "..",
                "..",
                "src",
                "static",
                file
            )
        );
        return `<link href="${href}" rel="stylesheet" />`;
    }

    private fixLinks(document: string, documentPath: string): string {
        //console.log(document);
        let result = document.replace(
            new RegExp("((?:src|href)=[\'\"])(?!(?:http:|https:|ftp:|#))(.*?)([\'\"])", "gmi"), (subString: string, p1: string, p2: string, p3: string): string => {
                 return [
                     p1,
                     fileUrl(path.join(
                         path.dirname(documentPath),
                         p2
                     )),
                     p3
                 ].join("");
             }
         );
        //console.log(result)
        return result;
    }

    public set_needs_rebuilds(value: Boolean) {
        this.needs_rebuild = true;
    }

    public preview(editor: TextEditor): Thenable<string> {
        let doc = editor.document;
        return new Promise<string>((resolve, reject) => {
            let text = doc.getText();
            let documentPath = path.dirname(editor.document.fileName);
            let tmpobj = tmp.fileSync({ postfix: '.adoc', dir: documentPath });
            let html_gerenator = workspace.getConfiguration('AsciiDoc').get('html_generator')
            let cmd = `${html_gerenator} "${tmpobj.name}"`
            fs.write(tmpobj.fd, text, 0);
            exec(cmd, (error: Error, stdout: Buffer, stderr: Buffer) => {
                tmpobj.removeCallback();
                if (error) {
                    let errorMessage = [
                        error.name,
                        error.message,
                        error.stack,
                        "",
                        stderr.toString()
                    ].join("\n");
                    console.error(errorMessage);
                    errorMessage = errorMessage.replace("\n", '<br><br>');
                    errorMessage += "<br><br>"
                    errorMessage += "<b>If the asciidoctor binary is not your your PATH, you can set the full path name<br>"
                    errorMessage += "Go to File -> Preverences -> User settingsm and adjust the AsciiDoc.html_generator config option</b>"
                    resolve(this.errorSnippet(errorMessage));
                } else {
                    let result = this.fixLinks(stdout.toString(), editor.document.fileName);
                    resolve(this.buildPage(result));
                }
            });
        });
    }

}

export function CreateHTMLWindow(provider, displayColumn: ViewColumn): PromiseLike<void> {
    let previewTitle = `Preview: '${path.basename(window.activeTextEditor.document.fileName)}'`;
    let previewUri = Uri.parse(`adoc-preview://preview/${previewTitle}`);

    // When the active document is changed set the provider for rebuild
    workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
        if (e.document === window.activeTextEditor.document) {
            provider.set_needs_rebuilds(true);
        }
    })

    workspace.onDidSaveTextDocument((e: TextDocument) => {
        if (e === window.activeTextEditor.document) {
            provider.update(previewUri);
        }
    })

    return commands.executeCommand("vscode.previewHtml", previewUri, displayColumn).then((success) => {
    }, (reason) => {
        console.warn(reason);
        window.showErrorMessage(reason);
    })
}


function TimerCallback(timer, provider, editor, previewUri) {

    provider._onDidChange.fire(previewUri);
}

export function CreateRefreshTimer(provider, editor, previewUri) {

    var timer = setInterval(
        () => {
            // This function gets called when the timer goes off.
            TimerCallback(timer, provider, editor, previewUri);
        },
        // The peroidicity of the timer.
        timerPeriod
    )
}

