/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocContributions } from './asciidocExtensions'
import { Slugifier } from './slugify'
import { AsciidocParser } from './asciidocParser'

const FrontMatterRegex = /^---\s*[^]*?(-{3}|\.{3})\s*/

export class AsciidocEngine {
  private ad?: AsciidocParser;

  private firstLine?: number;

  private currentDocument?: vscode.Uri;

  public constructor (
    private readonly extensionPreviewResourceProvider: AsciidocContributions,
    private readonly slugifier: Slugifier,
    private readonly errorCollection: vscode.DiagnosticCollection = null
  ) {
    this.extensionPreviewResourceProvider = extensionPreviewResourceProvider
    this.slugifier = slugifier
    this.errorCollection = errorCollection
  }

  private async getEngine (resource: vscode.Uri): Promise<AsciidocParser> {
    if (!this.ad) {
      this.ad = new AsciidocParser(resource.fsPath, this.errorCollection)
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

  public async render (document: vscode.Uri,
    stripFrontmatter: boolean,
    text: string, forHTML: boolean = false,
    backend: string = 'html5',
    context?: vscode.ExtensionContext,
    editor?: vscode.WebviewPanel): Promise<string> {
    let offset = 0
    if (stripFrontmatter) {
      const asciidocContent = this.stripFrontmatter(text)
      offset = asciidocContent.offset
      text = asciidocContent.text
    }

    this.currentDocument = document
    this.firstLine = offset
    const engine = await this.getEngine(document)
    const doc = await vscode.workspace.openTextDocument(document)
    return await engine.parseText(text, doc, forHTML, backend, context, editor)
  }

  public async load (document: vscode.Uri, source: string): Promise<any> {
    this.currentDocument = document
    const engine = await this.getEngine(document)
    const doc = await vscode.workspace.openTextDocument(document)
    await engine.parseText(source, doc)
    return engine.document
  }
}
