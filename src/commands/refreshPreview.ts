/*---------------------------------------------------------------------------------------------
  *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command } from '../commandManager'
import { AsciidocPreviewManager } from '../features/previewManager'

export class RefreshPreviewCommand implements Command {
  public readonly id = 'asciidoc.preview.refresh'

  public constructor (private readonly webviewManager: AsciidocPreviewManager) {
    this.webviewManager = webviewManager
  }

  public execute () {
    this.webviewManager.refresh()
  }
}
