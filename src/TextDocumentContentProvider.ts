import * as vscode from 'vscode';
import * as parser from './text-parser';
import fileUrl from 'file-url';

export default class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private lastPreviewHTML = "";
  private lastPreviewUri = "";
  private needsRebuild = true;

  constructor(private readonly webSocketServer: string, private readonly previewUri) {
    const refreshInterval = vscode.workspace.getConfiguration('AsciiDoc').get('refresh_interval', 1000);;
    var timer = setInterval(
      () => {
          this._onDidChange.fire(previewUri);
      },
      // The periodicity of the timer.
      refreshInterval
    )
  }

  public setNeedsRebuild(value: boolean) {
    this.needsRebuild = value;
  }

  public provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.needsRebuild ? this.createHtml(): this.lastPreviewHTML;
  }

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  public update(uri: vscode.Uri) {
    this._onDidChange.fire(uri);
  }

  private async createHtml() {
    const editor = vscode.window.activeTextEditor;
    const text = editor.document.getText();
    const path = vscode.extensions.getExtension('joaompinto.asciidoctor-vscode').extensionPath;

    var p = new Promise<string>(async resolve => {
      var html = this.lastPreviewHTML;
      var error_msg = null;
      var body = await parser.parseText(editor.document.fileName, text).catch((err) => { 
        console.error(err);
        return this.errorHtml(err)
      })
      if(error_msg != null)
        html = error_msg;
      if (editor.document && (editor.document.languageId === "asciidoc"))
        html = `<!DOCTYPE html>
        <html>
            <script src="${path + "/assets/websocket-setup.js"}"></script>
            <script>setupWebsocket("${this.webSocketServer}");</script>
            <style>body { padding: 0; margin: 0; }</style>
          </head>
          <body>
          ${body}
          </body>
        </html>`;
      resolve(html)
    })
    return p;
  }

  private errorHtml(error: string): string {
    return `<body>${error}</body>`;
  }


}
