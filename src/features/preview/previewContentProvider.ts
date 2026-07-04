import * as vscode from 'vscode'
import { WebviewResourceProvider } from '../../core/resources.js'
import { AsciidocEngine } from '../asciidoctor/asciidocEngine.js'
import { KrokiDiscoveryPrompt } from './krokiDiscoveryPrompt.js'
import { AsciidocPreviewConfigurationManager } from './previewConfig.js'

export class AsciidocContentProvider {
  private readonly krokiDiscoveryPrompt: KrokiDiscoveryPrompt

  constructor(
    private readonly asciidocEngine: AsciidocEngine,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.krokiDiscoveryPrompt = new KrokiDiscoveryPrompt(context.globalState)
  }

  public async providePreviewHTML(
    asciidocDocument: vscode.TextDocument,
    previewConfigurations: AsciidocPreviewConfigurationManager,
    editor: WebviewResourceProvider,
    line?: number,
    fragment?: string,
  ): Promise<string> {
    // Surface the one-time "Kroki can render these diagrams" hint when relevant.
    this.krokiDiscoveryPrompt.maybePrompt(asciidocDocument)
    const { html } = await this.asciidocEngine.convertFromTextDocument(
      asciidocDocument,
      this.context,
      editor,
      line,
      fragment,
    )
    return html
  }
}
