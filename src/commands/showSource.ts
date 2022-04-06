/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { Command } from '../commandManager'
import { AsciidocPreviewManager } from '../features/previewManager'

export class ShowSourceCommand implements Command {
  public readonly id = 'asciidoc.showSource'

  constructor (private readonly previewManager: AsciidocPreviewManager) {
    this.previewManager = previewManager
  }

  public execute () {
    if (this.previewManager.activePreviewResource) {
      return vscode.workspace.openTextDocument(this.previewManager.activePreviewResource)
        .then((document) => vscode.window.showTextDocument(document, this.previewManager.activePreviewResourceColumn))
    }
    return undefined
  }
}
