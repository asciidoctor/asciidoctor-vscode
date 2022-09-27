import * as vscode from 'vscode'

export interface WebviewResourceProvider {
  asWebviewUri(resource: vscode.Uri): vscode.Uri

  asMediaWebViewSrc(...pathSegments: string[]): string

  readonly cspSource: string
}
