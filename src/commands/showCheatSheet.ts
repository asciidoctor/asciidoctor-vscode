import * as vscode from 'vscode'

import { Command } from '../core/commandManager.js'
import { AsciidocPreviewManager } from '../features/preview/previewManager.js'

export class ShowCheatSheetCommand implements Command {
  public readonly id = 'asciidoc.showCheatSheet'

  constructor(
    private readonly webviewManager: AsciidocPreviewManager,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.webviewManager = webviewManager
    this.extensionUri = extensionUri
  }

  public execute() {
    // The cheat sheet is authored in AsciiDoc and bundled with the extension.
    // Rendering it through the regular preview keeps it in sync with what the
    // extension can actually render (dogfooding) and needs no bespoke viewer.
    const resource = vscode.Uri.joinPath(
      this.extensionUri,
      'media',
      'cheatsheet.adoc',
    )
    const resourceColumn =
      (vscode.window.activeTextEditor &&
        vscode.window.activeTextEditor.viewColumn) ||
      vscode.ViewColumn.One
    // Locked so the cheat sheet stays put and is not hijacked by whatever
    // document the author switches to next.
    this.webviewManager.preview(resource, {
      resourceColumn,
      previewColumn: resourceColumn + 1,
      locked: true,
    })
  }
}
