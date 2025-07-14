import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine'
import { WebviewResourceProvider } from '../util/resources'
import { AsciidocPreviewConfigurationManager } from './previewConfig'

export class AsciidocContentProvider {
  constructor(
    private readonly asciidocEngine: AsciidocEngine,
    private readonly context: vscode.ExtensionContext,
  ) {}

  public async providePreviewHTML(
    asciidocDocument: vscode.TextDocument,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    editor: WebviewResourceProvider,
    line?: number,
  ): Promise<string> {
    const { html } = await this.asciidocEngine.convertFromTextDocument(
      asciidocDocument,
      this.context,
      editor,
      line,
    )
    return html
  }
}
