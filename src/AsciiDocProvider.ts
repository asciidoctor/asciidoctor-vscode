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
import * as Asciidoctor from "asciidoctor.js";

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
let fileUrl = require("file-url");

const asciidoctor_config =  {
    runtime: {
        platform: 'node',
        engine: 'v8'
    }
}

export default class AsciiDocProvider implements TextDocumentContentProvider {
    static scheme = 'adoc-preview';

    private _onDidChange = new EventEmitter<Uri>();
    private resultText = "";
    private lastPreviewHTML = null;
    private lastURI = null;
    private needsRebuild : boolean = true;
    private editorDocument: TextDocument = null;
    private refreshInterval = 1000;


    private asciidoctor = Asciidoctor(asciidoctor_config);

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

        // Rebuild if there were changes to the file, or if the content is beeing request
        // for a different uri.
        if (this.needsRebuild || doc.uri != this.lastURI) {
            this.lastPreviewHTML = this.preview(doc);
            this.lastURI = doc.uri;
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
        let result = document.replace(
            new RegExp("((?:src|href)=[\'\"])(?!(?:http:|https:|ftp:|#))(.*?)([\'\"])", "gmi"),
                (subString: string, p1: string, p2: string, p3: string): string => {
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
        return result;
    }

    public setNeedsRebuild(value: Boolean) {
        this.needsRebuild = true;
    }

    public preview(doc: TextDocument): Thenable<string> {
        let use_asciidoctor_js = workspace.getConfiguration('AsciiDoc').get('use_asciidoctor_js');

        let text = doc.getText();
        let documentPath = path.dirname(doc.fileName);


        if(use_asciidoctor_js)
        {
            const options = {
                safe: 'unsafe',
                doctype: 'inline',
                header_footer: true,
                attributes: ['copycss'],
                to_file: false,
                base_dir: path.dirname(doc.fileName),
                sourcemap: true
            };

            return new Promise<string>((resolve, reject) => {
                let ascii_doc = this.asciidoctor.loadFile(doc.fileName, options);
                const blocksWithLineNumber = ascii_doc.findBy(function (b) { return typeof b.getLineNumber() !== 'undefined'; });
                blocksWithLineNumber.forEach(function(block, key, myArray) {
                        block.addRole("data-line-" + block.getLineNumber());
                    });
                let resultHTML = ascii_doc.convert(options);
                let result = this.fixLinks(resultHTML, doc.fileName);
                //console.log(result);
                resolve(this.buildPage(result));
            })
        } else
            return new Promise<string>((resolve, reject) => {
                let asciidoctor_command = workspace.getConfiguration('AsciiDoc').get('asciidoctor_command', 'asciidoctor');
                var options = { shell: true, cwd: path.dirname(doc.fileName) }
                var asciidoctor = spawn(asciidoctor_command, ['-q', '-o-', '-', '-B', path.dirname(doc.fileName)], options );
                asciidoctor.stdin.write(text);
                asciidoctor.stdin.end();
                asciidoctor.stderr.on('data', (data) => {
                    let errorMessage = data.toString();
                    console.error(errorMessage);
                    errorMessage += errorMessage.replace("\n", '<br><br>');
                    errorMessage += "<br><br>"
                    errorMessage += "<b>If the asciidoctor binary is not in your PATH, you can set the full path.<br>"
                    errorMessage += "Go to `File -> Preferences -> User settings` and adjust the AsciiDoc.asciidoctor_command</b>"
                    resolve(this.errorSnippet(errorMessage));
                })
                asciidoctor.stdout.on('data', (data) => {
                    let result = this.fixLinks(data.toString(), doc.fileName);
                    resolve(this.buildPage(result));
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
