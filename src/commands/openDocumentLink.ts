import { extname } from 'node:path'
import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { isAsciidocFile } from '../core/file.js'
import { AsciidocLoader } from '../features/asciidoctor/asciidocLoader.js'
import { getReferenceLinesFromDocument } from '../features/completion/crossReferences.js'
import { TableOfContentsProvider } from '../features/tableOfContentsProvider.js'

export interface OpenDocumentLinkArgs {
  path: string
  fragment: string
}

export class OpenDocumentLinkCommand implements Command {
  private static readonly id = '_asciidoc.openDocumentLink'
  public readonly id = OpenDocumentLinkCommand.id

  public constructor(private readonly asciidocLoader: AsciidocLoader) {}

  public static createCommandUri(path: string, fragment: string): vscode.Uri {
    return vscode.Uri.parse(
      `command:${OpenDocumentLinkCommand.id}?${encodeURIComponent(JSON.stringify({ path, fragment }))}`,
    )
  }

  public execute(args: OpenDocumentLinkArgs) {
    const p = decodeURIComponent(args.path)
    return this.tryOpen(p, args).catch(async () => {
      if (extname(p) === '') {
        return this.tryOpen(p + '.adoc', args)
      }
      const resource = vscode.Uri.file(p)
      await vscode.commands.executeCommand('vscode.open', resource)
      return undefined
    })
  }

  private async tryOpen(path: string, args: OpenDocumentLinkArgs) {
    const resource = vscode.Uri.file(path)
    if (
      vscode.window.activeTextEditor &&
      isAsciidocFile(vscode.window.activeTextEditor.document) &&
      vscode.window.activeTextEditor.document.uri.fsPath === resource.fsPath
    ) {
      return this.tryRevealLine(vscode.window.activeTextEditor, args.fragment)
    } else {
      return vscode.workspace
        .openTextDocument(resource)
        .then(vscode.window.showTextDocument)
        .then((editor) => this.tryRevealLine(editor, args.fragment))
    }
  }

  private async tryRevealLine(editor: vscode.TextEditor, fragment?: string) {
    if (editor && fragment) {
      // Resolve the anchor through Asciidoctor's reference catalog first: unlike
      // the table of contents (sections only), it also covers inline `[[id]]`
      // anchors and block ids — the exact case from #705 (an anchor on a
      // paragraph) — and maps each to its source line.
      const referenceLine = await this.lookupReferenceLine(
        editor.document,
        fragment,
      )
      if (referenceLine !== undefined) {
        return editor.revealRange(
          new vscode.Range(referenceLine, 0, referenceLine, 0),
          vscode.TextEditorRevealType.AtTop,
        )
      }
      const toc = new TableOfContentsProvider(
        editor.document,
        this.asciidocLoader,
      )
      const entry = await toc.lookup(fragment)
      if (entry) {
        return editor.revealRange(
          new vscode.Range(entry.line, 0, entry.line, 0),
          vscode.TextEditorRevealType.AtTop,
        )
      }
      const lineNumberFragment = fragment.match(/^L(\d+)$/i)
      if (lineNumberFragment) {
        const line = +lineNumberFragment[1] - 1
        if (!isNaN(line)) {
          return editor.revealRange(
            new vscode.Range(line, 0, line, 0),
            vscode.TextEditorRevealType.AtTop,
          )
        }
      }
    }
  }

  /**
   * Source line (0-based) of a cross-reference target — section, block or inline
   * anchor — resolved through Asciidoctor's reference catalog, or `undefined`
   * when the id is unknown or carries no source location.
   */
  private async lookupReferenceLine(
    document: vscode.TextDocument,
    fragment: string,
  ): Promise<number | undefined> {
    try {
      const referenceLines = getReferenceLinesFromDocument(
        await this.asciidocLoader.load(document),
      )
      const line = referenceLines.get(fragment)
      // The catalog reports 1-based line numbers.
      return line !== undefined ? Math.max(0, line - 1) : undefined
    } catch {
      return undefined
    }
  }
}

export async function resolveLinkToAsciidocFile(
  path: string,
): Promise<vscode.Uri | undefined> {
  try {
    const standardLink = await tryResolveLinkToAsciidocFile(path)
    if (standardLink) {
      return standardLink
    }
  } catch {
    // Noop
  }

  // If no extension, try with `.adoc` extension
  if (extname(path) === '') {
    return tryResolveLinkToAsciidocFile(path + '.adoc')
  }

  return undefined
}

async function tryResolveLinkToAsciidocFile(
  path: string,
): Promise<vscode.Uri | undefined> {
  const resource = vscode.Uri.file(path)

  let document: vscode.TextDocument
  try {
    document = await vscode.workspace.openTextDocument(resource)
  } catch {
    return undefined
  }
  if (isAsciidocFile(document)) {
    return document.uri
  }
  return undefined
}
