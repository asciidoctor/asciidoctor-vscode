/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { extname } from 'path'

import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'
import { TableOfContentsProvider } from '../tableOfContentsProvider'
import { isAsciidocFile } from '../util/file'

export interface OpenDocumentLinkArgs {
  hrefPath: string;
  fragment: string;
}

export class OpenDocumentLinkCommand implements Command {
  public readonly id = 'asciidoc.openDocumentLink'

  public constructor (private readonly engine: AsciidocEngine) {
    this.engine = engine
  }

  public static createCommandUri (hrefPath: string, fragment: string): vscode.Uri {
    // TODO: why can I not reference the class property id below without a tsc error?
    return vscode.Uri.parse(`command:asciidoc.openDocumentLink${encodeURIComponent(JSON.stringify({ hrefPath, fragment }))}`)
  }

  public async execute (args: OpenDocumentLinkArgs) {
    const p = decodeURIComponent(args.hrefPath)

    // It is currently not easy to iterate over all editors, visibleTextEditors are those which are open on the
    // screen, not behind any others, see:
    // https://github.com/microsoft/vscode/issues/133532 https://github.com/microsoft/vscode/issues/15178
    // TODO: Iterate across all open editors instead of visibleTextEditors when API becomes stable
    for (const visibleEditor of vscode.window.visibleTextEditors) {
      if (p === visibleEditor.document.uri.path) {
        const editor = await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn)
        const position = new vscode.Position(0, 0)
        editor.selection = new vscode.Selection(position, position)
        return
      }
    }

    return this.tryOpen(p, args).catch(async () => {
      if (extname(p) === '') {
        return this.tryOpen(p + '.adoc', args)
      }
      const resource = vscode.Uri.file(p)
      await vscode.commands.executeCommand('vscode.open', resource)
      return undefined
    })
  }

  private async tryOpen (path: string, args: OpenDocumentLinkArgs) {
    const resource = vscode.Uri.file(path)
    if (vscode.window.activeTextEditor && isAsciidocFile(vscode.window.activeTextEditor.document) &&
        vscode.window.activeTextEditor.document.uri.fsPath === resource.fsPath) {
      return this.tryRevealLine(vscode.window.activeTextEditor, args.fragment)
    } else {
      return vscode.workspace.openTextDocument(resource)
        .then(vscode.window.showTextDocument)
        .then((editor) => this.tryRevealLine(editor, args.fragment))
    }
  }

  private async tryRevealLine (editor: vscode.TextEditor, fragment?: string) {
    if (editor && fragment) {
      const toc = new TableOfContentsProvider(this.engine, editor.document)
      const entry = await toc.lookup(fragment)
      if (entry) {
        return editor.revealRange(new vscode.Range(entry.line, 0, entry.line, 0), vscode.TextEditorRevealType.AtTop)
      }
      const lineNumberFragment = fragment.match(/^L(\d+)$/i)
      if (lineNumberFragment) {
        const line = +lineNumberFragment[1] - 1
        if (!isNaN(line)) {
          return editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop)
        }
      }
    }
  }
}

export async function resolveLinkToAsciidocFile (path: string): Promise<vscode.Uri | undefined> {
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

async function tryResolveLinkToAsciidocFile (path: string): Promise<vscode.Uri | undefined> {
  const resource = vscode.Uri.file(path)

  let document: vscode.TextDocument
  try {
    document = await vscode.workspace.openTextDocument(resource)
  } catch (e) {
    vscode.window.showErrorMessage(e.toString())
  }
  if (isAsciidocFile(document)) {
    return document.uri
  }
  return undefined
}
