import { TextLine, Uri } from 'vscode'

export interface SkinnyTextDocument {
  /**
   * The associated uri for this document.
   *
   * *Note* that most documents use the `file`-scheme, which means they are files on disk. However, **not** all documents are
   * saved on disk and therefore the `scheme` must be checked before trying to access the underlying file or siblings on disk.
   *
   * @see {@link FileSystemProvider}
   * @see {@link TextDocumentContentProvider}
   */
  readonly uri: Uri;

  /**
   * The file system path of the associated resource. Shorthand
   * notation for {@link TextDocument.uri TextDocument.uri.fsPath}. Independent of the uri scheme.
   */
  readonly fileName: string;

  /**
   * The number of lines in this document.
   */
  readonly lineCount: number;

  /**
   * Get the text of this document.
   *
   * @return The entire text.
   */
  getText(): string;

  /**
   * Returns a text line denoted by the line number. Note
   * that the returned object is *not* live and changes to the
   * document are not reflected.
   *
   * @param line A line number in [0, lineCount).
   * @return A {@link TextLine line}.
   */
  lineAt(line: number): TextLine;
}
