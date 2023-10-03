import vscode, { Uri } from 'vscode'
import path from 'path'
import { getWorkspaceFolder } from './util/workspace'

interface DocumentWithUri {
  readonly uri: Uri;
}

export class AsciidocTextDocument {
  private uri: Uri

  private constructor () {
  }

  public static fromTextDocument (textDocument: DocumentWithUri): AsciidocTextDocument {
    const asciidocTextDocument = new AsciidocTextDocument()
    asciidocTextDocument.uri = textDocument.uri
    return asciidocTextDocument
  }

  /**
   * Get the base directory.
   * @private
   */
  public getBaseDir (): string | undefined {
    const useWorkspaceAsBaseDir = vscode.workspace.getConfiguration('asciidoc', null).get('useWorkspaceRootAsBaseDirectory')
    if (useWorkspaceAsBaseDir) {
      const workspaceFolder = getWorkspaceFolder(this.uri)
      if (workspaceFolder) {
        return workspaceFolder.uri.fsPath
      }
    }
    return 'browser' in process && (process as any).browser === true
      ? undefined
      : path.dirname(path.resolve(this.uri.fsPath))
  }
}
