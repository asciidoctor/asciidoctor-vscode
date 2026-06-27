import path from 'node:path'
import * as vscode from 'vscode'
import { Uri } from 'vscode'
import { getWorkspaceFolder } from '../../core/workspace.js'

interface DocumentWithUri {
  readonly uri: Uri
}

export class AsciidocTextDocument {
  public baseDir: string | undefined
  public baseDirOverride: string | undefined
  public dir: string | undefined
  public dirName: string | undefined
  public extensionName: string
  public fileName: string | undefined
  public filePath: string | undefined

  private constructor(private uri: Uri) {
    this.dirName = AsciidocTextDocument.getDirName(uri)
    this.baseDirOverride = AsciidocTextDocument.getBaseDirOverride(uri)
    this.baseDir = this.baseDirOverride ?? this.dirName
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
   * Get the explicit `base_dir` to pass to the Asciidoctor.js API.
   *
   * Returns the workspace root only when `asciidoc.useWorkspaceRootAsBaseDirectory`
   * is enabled and the document belongs to a workspace folder. Otherwise it
   * returns `undefined` so that Asciidoctor derives `base_dir` from `docdir`
   * itself, which is the recommended behaviour (see #926): setting `base_dir`
   * explicitly is a known footgun that can break relative includes.
   * @private
   */
  private static getBaseDirOverride(uri: Uri): string | undefined {
    const useWorkspaceAsBaseDir = vscode.workspace
      .getConfiguration('asciidoc', null)
      .get('useWorkspaceRootAsBaseDirectory')
    if (useWorkspaceAsBaseDir) {
      const workspaceFolder = getWorkspaceFolder(uri)
      if (workspaceFolder) {
        return workspaceFolder.uri.fsPath
      }
    }
    return undefined
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
