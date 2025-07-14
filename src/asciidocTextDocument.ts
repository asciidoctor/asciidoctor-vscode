import path from 'path'
import vscode, { Uri } from 'vscode'
import { getWorkspaceFolder } from './util/workspace'

interface DocumentWithUri {
  readonly uri: Uri
}

export class AsciidocTextDocument {
  public baseDir: string | undefined
  public dir: string | undefined
  public dirName: string | undefined
  public extensionName: string
  public fileName: string | undefined
  public filePath: string | undefined

  private constructor(private uri: Uri) {
    this.baseDir = AsciidocTextDocument.getBaseDir(uri)
    this.dirName = AsciidocTextDocument.getDirName(uri)
    this.extensionName = AsciidocTextDocument.getExtensionName(uri)
    this.fileName = AsciidocTextDocument.getFileName(uri)
    this.filePath = AsciidocTextDocument.getFilePath(uri)
  }

  public static fromTextDocument(
    textDocument: DocumentWithUri,
  ): AsciidocTextDocument {
    return new AsciidocTextDocument(textDocument.uri)
  }

  /**
   * Get the base directory.
   * @private
   */
  private static getBaseDir(uri: Uri): string | undefined {
    const useWorkspaceAsBaseDir = vscode.workspace
      .getConfiguration('asciidoc', null)
      .get('useWorkspaceRootAsBaseDirectory')
    if (useWorkspaceAsBaseDir) {
      const workspaceFolder = getWorkspaceFolder(uri)
      if (workspaceFolder) {
        return workspaceFolder.uri.fsPath
      }
    }
    return AsciidocTextDocument.getDirName(uri)
  }

  private static getDirName(uri: Uri): string | undefined {
    return 'browser' in process && (process as any).browser === true
      ? undefined
      : path.dirname(path.resolve(uri.fsPath))
  }

  /**
   * Return the extension name of the file without the '.'.
   * @param uri
   * @private
   */
  private static getExtensionName(uri: Uri): string {
    const textDocumentExt = path.extname(uri.path)
    return textDocumentExt.startsWith('.') ? textDocumentExt.substring(1) : ''
  }

  /**
   * Return the file name without the file extension.
   * @param uri
   * @private
   */
  public static getFileName(uri: Uri): string | undefined {
    if ('browser' in process && (process as any).browser === true) {
      return undefined
    }
    return path.parse(uri.fsPath).name
  }

  /**
   * Return the filesystem path of the URI.
   * @param uri
   * @private
   */
  public static getFilePath(uri: Uri): string | undefined {
    if ('browser' in process && (process as any).browser === true) {
      return undefined
    }
    return uri.fsPath
  }
}
