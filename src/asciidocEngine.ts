/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { AsciidocContributionProvider } from './asciidocExtensions'
import { AsciidocParser, AsciidoctorBuiltInBackends } from './asciidocParser'
import { Asciidoctor } from '@asciidoctor/core'
import { SkinnyTextDocument } from './util/document'
import { AsciidoctorExtensionsSecurityPolicyArbiter } from './security'

export class AsciidocEngine {
  private ad?: AsciidocParser

  public constructor (
    private readonly contributionProvider: AsciidocContributionProvider,
    private readonly asp: AsciidoctorExtensionsSecurityPolicyArbiter = null,
    private readonly errorCollection: vscode.DiagnosticCollection = null
  ) {}

  private getEngine (): AsciidocParser {
    // singleton
    if (!this.ad) {
      this.ad = new AsciidocParser(this.contributionProvider, this.asp, this.errorCollection)
    }

    return this.ad
  }

  public async convert (
    documentUri: vscode.Uri,
    text: string,
    context: vscode.ExtensionContext,
    editor: vscode.WebviewPanel,
    line?: number
  ): Promise<{output: string, document?: Asciidoctor.Document}> {
    const parser = this.getEngine()
    const textDocument = await vscode.workspace.openTextDocument(documentUri)
    const { html: output, document } = await parser.convertUsingJavascript(text, textDocument, context, editor, line)
    return { output, document }
  }

  public async export (
    textDocument: vscode.TextDocument,
    backend: AsciidoctorBuiltInBackends,
    asciidoctorAttributes = {}
  ): Promise<{ output: string, document: Asciidoctor.Document }> {
    const parser = this.getEngine()
    return parser.export(textDocument.getText(), textDocument, backend, asciidoctorAttributes)
  }

  public static load (textDocument: SkinnyTextDocument): Asciidoctor.Document {
    const { document } = AsciidocParser.load(textDocument)
    return document
  }
}
