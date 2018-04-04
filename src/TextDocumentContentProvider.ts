import * as vscode from 'vscode';
import * as parser from './text-parser';
import fileUrl from 'file-url';
import { isNullOrUndefined } from 'util'


export default class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public lastPreviewHTML = "";
  private lastPreviewUri = "";
  public needsRebuild = true;
  public current_line = 0;

  constructor(private readonly previewUri) {
    const refreshInterval = vscode.workspace.getConfiguration('AsciiDoc').get('refresh_interval', 1000);;
    /* Setup a timer to check if the preview should be rebuilt */
    var timer = setInterval(
      () => {
          if(this.needsRebuild)
              this.update(previewUri)
      },
      // The periodicity of the timer.
      refreshInterval
    )
  }

  /*
    Called by vscode when the content needs to be rendered
  */
  public provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.createHtml();
  }

  /* Called when the content changes r*/
  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  /* Trigget content update */
  public update(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }

  /* Builds the content from the active text editor window */
  public async createHtml() {
    const editor = vscode.window.activeTextEditor;


    const text = editor.document.getText();
    const path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;

    var p = new Promise<string>(async resolve => {
      var line = this.current_line
      var html = ''
      var error_msg = null
      var body = await parser.parseText(editor.document.fileName, text).catch((err) => {
        console.error(err)
        return this.errorHtml(err)
      })
      if(error_msg != null)
        html = error_msg
      if (editor.document && (editor.document.languageId === "asciidoc"))
        html = `<!DOCTYPE html>
        <html
          <head>
            <link rel="stylesheet" type="text/css" href="${path + "/assets/preview.css"}">
            <script src="${path + "/assets/scroll-to-element.js"}"></script>
            <style>body { padding: 0; margin: 0; }</style>
          </head>
          <body onload="ScrollToLine(${line})">
          <div class="data-line-1"></div>
          ${body}
          </body>
        </html>`;
      this.needsRebuild = false;
      resolve(html)
    })
    return p;
  }

  private errorHtml(error: string): string {
    return `<body>${error}</body>`;
  }

}
