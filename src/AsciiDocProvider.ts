
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


export default class AsciiDocProvider implements TextDocumentContentProvider {
    static scheme = 'adoc-preview';

    private _onDidChange = new EventEmitter<Uri>();
    private resultText = "";
    private lastPreviewHTML = null;
    private lastPreviewTime = new Date();
    private needsRebuild : boolean = true;
    private editorDocument: TextDocument = null;
    private refreshInterval = 1000;


    private resolveDocument(uri: Uri): TextDocument {
        const matches = workspace.textDocuments.filter(d => {
            return MakePreviewUri(d).toString() == uri.toString(); 
        });
        if (matches.length > 0) {
            return matches[0];
        } else {
            return null;
        }
    }

    public provideTextDocumentContent(uri: Uri): string | Thenable<string> {
        const doc = this.resolveDocument(uri);
        return this.createAsciiDocHTML(doc);
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }

    private createAsciiDocHTML(doc: TextDocument): string | Thenable<string> {
        let editor = window.activeTextEditor;

        if ( !doc || !(doc.languageId === "asciidoc")) {
            return this.errorSnippet("Active editor doesn't show an AsciiDoc document - no properties to preview.");
        }
        if (this.needsRebuild) {
            this.lastPreviewHTML = this.preview(doc);
            this.needsRebuild = false
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

    public setNeedsRebuild(value: Boolean) {
        this.needsRebuild = true;
    }

    public preview(doc: TextDocument): Thenable<string> {
        return new Promise<string>((resolve, reject) => {
            let text = doc.getText();
            let documentPath = path.dirname(doc.fileName);
            let tmpobj = tmp.fileSync({ postfix: '.adoc', dir: documentPath });
            let html_generator = workspace.getConfiguration('AsciiDoc').get('html_generator')
            let cmd = `${html_generator} "${tmpobj.name}"`
            fs.write(tmpobj.fd, text, 0);
            let maxBuff = parseInt(workspace.getConfiguration('AsciiDoc').get('buffer_size_kB'))
            exec(cmd, {maxBuffer: 1024 * maxBuff}, (error, stdout, stderr) => {
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
                    errorMessage += "<b>If the asciidoctor binary is not in your PATH, you can set the full path.<br>"
                    errorMessage += "Go to `File -> Preferences -> User settings` and adjust the AsciiDoc.html_generator config option.</b>"
                    errorMessage += "<br><br><b>Alternatively if you get a stdout maxBuffer exceeded error, Go to `File -> Preferences -> User settings and adjust the AsciiDoc.buffer_size_kB to a larger number (default is 200 kB).</b>"
                    resolve(this.errorSnippet(errorMessage));
                } else {
                    let result = this.fixLinks(stdout.toString(), doc.fileName);
                    resolve(this.buildPage(result));
                }
            });
        });
    }

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
        // The periodicity of the timer.
        provider.refreshInterval
    );
}

export function MakePreviewUri(doc: TextDocument): Uri {
    return Uri.parse(`adoc-preview://preview/${doc.fileName}`);
}

export function CreateHTMLWindow(provider: AsciiDocProvider, displayColumn: ViewColumn): PromiseLike<void> {
    let previewTitle = `Preview: '${path.basename(window.activeTextEditor.document.fileName)}'`;
    let previewUri = MakePreviewUri(window.activeTextEditor.document);

    CreateRefreshTimer(provider, window.activeTextEditor, previewUri);
    return commands.executeCommand("vscode.previewHtml", previewUri, displayColumn).then((success) => {
    }, (reason) => {
        console.warn(reason);
        window.showErrorMessage(reason);
    })
}
