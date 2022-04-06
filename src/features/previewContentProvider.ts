import * as vscode from 'vscode'
import { AsciidocEngine } from '../asciidocEngine'

import { AsciidocPreviewConfigurationManager } from './previewConfig'

export class AsciidocContentProvider {
  constructor (private readonly engine: AsciidocEngine, private readonly context: vscode.ExtensionContext) {}

  public async providePreviewHTML (
    asciidocDocument: vscode.TextDocument,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    editor: vscode.WebviewPanel
  ): Promise<string> {
    const sourceUri = asciidocDocument.uri
    const config = previewConfigurations.loadAndCacheConfiguration(sourceUri)

    const { output } = await this.engine.convert(sourceUri, config.previewFrontMatter === 'hide', asciidocDocument.getText(), this.context, editor)
    return output
  }
}
