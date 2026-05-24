import * as vscode from 'vscode'
import { Command } from '../core/commandManager.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'

export class ShowSourceCommand implements Command {
  public readonly id = 'asciidoc.showSource'

  constructor(private readonly previewManager: AsciidocPreviewManager) {
    this.previewManager = previewManager
  }

  public execute() {
    if (this.previewManager.activePreviewResource) {
      return vscode.workspace
        .openTextDocument(this.previewManager.activePreviewResource)
        .then((document) =>
          vscode.window.showTextDocument(
            document,
            this.previewManager.activePreviewResourceColumn,
          ),
        )
    }
    return undefined
  }
}
