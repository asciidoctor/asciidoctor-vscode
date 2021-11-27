/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { extname } from 'path'

import { Command } from '../commandManager'
import { AsciidocEngine } from '../asciidocEngine'
import { isAsciidocFile } from '../util/file'

export interface OpenDocumentLinkArgs {
  path: string
  fragment: string
}

export class OpenDocumentLinkCommand implements Command {
  private static readonly id = '_asciidoc.openDocumentLink'
  public readonly id = OpenDocumentLinkCommand.id

  public constructor (private readonly engine: AsciidocEngine) {
  }

  public static createCommandUri (
    path: string,
    fragment: string
  ): vscode.Uri {
    return vscode.Uri.parse(`command:${OpenDocumentLinkCommand.id}?${encodeURIComponent(JSON.stringify({ path, fragment }))}`)
  }

  public execute (args: OpenDocumentLinkArgs) {
    const p = decodeURIComponent(args.path)
    return this.tryOpen(p, args).catch(async () => {
      if (extname(p) === 'adoc') {
        return this.tryOpen(p, args)
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
    // editor.document.uri.path === this.engine.currentDocument.path &&  (needed?)
    if (this.engine.ad && isAsciidocFile(editor.document)) {
      await this.engine.load(editor.document.uri, editor.document.getText())
      const entryLineInfo = await this.engine.ad.idsByLineNo.get(fragment)
      if (entryLineInfo !== undefined) {
        return editor.revealRange(new vscode.Range(entryLineInfo[0] - 1, 0, entryLineInfo[0] - 1, 0), vscode.TextEditorRevealType.AtTop)
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
  } catch {
    return undefined
  }
  if (isAsciidocFile(document)) {
    return document.uri
  }
  return undefined
}
