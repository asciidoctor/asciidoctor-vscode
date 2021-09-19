/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode'
import { Command } from '../commandManager'
import { PreviewSecuritySelector } from '../security'
import { isAsciidocFile } from '../util/file'
import { AsciidocPreviewManager } from '../features/previewManager'

export class ShowPreviewSecuritySelectorCommand implements Command {
  public readonly id = 'asciidoc.showPreviewSecuritySelector'

  constructor (private readonly previewSecuritySelector: PreviewSecuritySelector,
    private readonly previewManager: AsciidocPreviewManager) {
    this.previewManager = previewManager
    this.previewSecuritySelector = previewSecuritySelector
  }

  public execute (resource: string | undefined) {
    if (this.previewManager.activePreviewResource) {
      this.previewSecuritySelector.showSecuritySelectorForResource(this.previewManager.activePreviewResource)
    } else if (resource) {
      const source = vscode.Uri.parse(resource)
      this.previewSecuritySelector.showSecuritySelectorForResource(source.query ? vscode.Uri.parse(source.query) : source)
    } else if (vscode.window.activeTextEditor && isAsciidocFile(vscode.window.activeTextEditor.document)) {
      this.previewSecuritySelector.showSecuritySelectorForResource(vscode.window.activeTextEditor.document.uri)
    }
  }
}
