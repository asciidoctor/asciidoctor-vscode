import { Command } from '../core/commandManager.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'

export class RefreshPreviewCommand implements Command {
  public readonly id = 'asciidoc.preview.refresh'

  public constructor(private readonly webviewManager: AsciidocPreviewManager) {
    this.webviewManager = webviewManager
  }

  public execute() {
    this.webviewManager.refresh(true)
  }
}
