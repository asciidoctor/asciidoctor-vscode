/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocContributions } from './asciidocExtensions'
import { AsciidocParser, AsciidoctorBuiltInBackends } from './asciidocParser'
import { Asciidoctor } from '@asciidoctor/core'
import { SkinnyTextDocument } from './util/document'

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/

export class AsciidocEngine {
  private ad?: AsciidocParser

  private firstLine?: number

  public constructor (
    readonly extensionPreviewResourceProvider: AsciidocContributions,
    private readonly errorCollection: vscode.DiagnosticCollection = null
  ) {
    this.extensionPreviewResourceProvider = extensionPreviewResourceProvider
    this.errorCollection = errorCollection
  }

  private getEngine (): AsciidocParser {
    // singleton
    if (!this.ad) {
      this.ad = new AsciidocParser(this.extensionPreviewResourceProvider.extensionUri, this.errorCollection)
    }

    return this.ad
  }

  private stripFrontmatter (text: string): { text: string, offset: number } {
    let offset = 0
    const frontMatterMatch = FrontMatterRegex.exec(text)
    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[0]
      offset = frontMatter.split(/\r\n|\n|\r/g).length - 1
      text = text.substr(frontMatter.length)
    }
    return { text, offset }
  }

  public async convert (
    documentUri: vscode.Uri,
    stripFrontmatter: boolean,
    text: string,
    context: vscode.ExtensionContext,
    editor: vscode.WebviewPanel
  ): Promise<{output: string, document?: Asciidoctor.Document}> {
    let offset = 0
    if (stripFrontmatter) {
      const asciidocContent = this.stripFrontmatter(text)
      offset = asciidocContent.offset
      text = asciidocContent.text
    }

    this.firstLine = offset
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const { html: output, document } = this.getEngine().convertUsingJavascript(text, textDocument, context, editor)
    return { output, document }
  }

  public export (textDocument: vscode.TextDocument, backend: AsciidoctorBuiltInBackends): { output: string, document: Asciidoctor.Document } {
    return this.getEngine().export(textDocument.getText(), textDocument, backend)
  }

  public load (textDocument: SkinnyTextDocument): Asciidoctor.Document {
    const { document } = this.getEngine().load(textDocument)
    return document
  }
}
